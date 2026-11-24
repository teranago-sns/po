<#
.SYNOPSIS
    Downloads フォルダを常時監視し、Google AI Studio の最新 ZIP を検知したら
    本番リポジトリ (teranago-sns/po) へ自動反映・コミット・プッシュする監視スクリプト
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# コンソール出力を UTF-8 に統一（文字化け防止）
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# ZIP 展開用アセンブリ読み込み
Add-Type -AssemblyName System.IO.Compression.FileSystem

# =========================
# 基本設定
# =========================
$RepoRoot = $PSScriptRoot
$DownloadsDir = Join-Path $HOME 'Downloads'
if (-not (Test-Path -LiteralPath $DownloadsDir)) {
    try {
        $shellDownloads = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path
        if ($shellDownloads -and (Test-Path -LiteralPath $shellDownloads)) {
            $DownloadsDir = $shellDownloads
        }
    } catch {
        # フォールバック失敗時は後段でエラー終了
    }
}

# 削除・上書きから絶対に保護するルート直下のファイル・フォルダ
$ProtectedItems = @(
    '.git',
    '.env',
    '.agent',
    'watch-deploy.ps1',
    'start-watch.bat'
)

# コミット・プッシュを禁止する機密・ローカルデータ系パス（.env.example や src/data/ 等のソースコードは許可）
$ForbiddenStagePattern = '(^|/)\.env($|\.(?!example$).*)|^(uploads|data)/'

# =========================
# ユーティリティ関数
# =========================
function Get-TimeStamp {
    return (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
}

function Write-Log {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Gray
    )
    Write-Host ("[{0}] {1}" -f (Get-TimeStamp), $Message) -ForegroundColor $Color
}

function Find-GitExecutable {
    # 1. GitHub Desktop 同梱の git.exe を優先検索（最新バージョン優先）
    $ghdPattern = Join-Path $env:LOCALAPPDATA 'GitHubDesktop\app-*\resources\app\git\cmd\git.exe'
    $ghdMatches = @(Get-ChildItem -Path $ghdPattern -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending)
    if ($ghdMatches.Count -gt 0) {
        return $ghdMatches[0].FullName
    }

    # 2. 標準の Git for Windows インストール先を検索
    $standardCandidates = @(
        'C:\Program Files\Git\cmd\git.exe',
        'C:\Program Files (x86)\Git\cmd\git.exe',
        (Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe')
    )
    foreach ($candidate in $standardCandidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    # 3. 環境変数 PATH から検索
    $cmd = Get-Command git -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    return $null
}

function Wait-FileReady {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [int]$WaitSeconds = 3,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        if (-not (Test-Path -LiteralPath $Path)) {
            return $false
        }

        $unlocked = $false
        $sizeBefore = -1
        try {
            $itemBefore = Get-Item -LiteralPath $Path -ErrorAction Stop
            $sizeBefore = $itemBefore.Length
            $stream = [System.IO.File]::Open(
                $Path,
                [System.IO.FileMode]::Open,
                [System.IO.FileAccess]::Read,
                [System.IO.FileShare]::None
            )
            $stream.Close()
            $stream.Dispose()
            $unlocked = $true
        } catch {
            $unlocked = $false
        }

        # ロック解除およびサイズ安定確認のため 3 秒待機
        Start-Sleep -Seconds $WaitSeconds

        if ($unlocked -and (Test-Path -LiteralPath $Path)) {
            try {
                $itemAfter = Get-Item -LiteralPath $Path -ErrorAction Stop
                if ($itemAfter.Length -gt 0 -and $itemAfter.Length -eq $sizeBefore) {
                    $stream2 = [System.IO.File]::Open(
                        $Path,
                        [System.IO.FileMode]::Open,
                        [System.IO.FileAccess]::Read,
                        [System.IO.FileShare]::None
                    )
                    $stream2.Close()
                    $stream2.Dispose()
                    return $true
                }
            } catch {
                # まだロック中または書き込み継続中
            }
        }
    }

    return $false
}

function Resolve-AppSourceRoot {
    param(
        [Parameter(Mandatory = $true)][string]$ExtractedDir
    )

    # パターン1: 解凍直下に package.json と src フォルダがある（Google AI Studio 標準形式）
    $pkgRoot = Join-Path $ExtractedDir 'package.json'
    $srcRoot = Join-Path $ExtractedDir 'src'
    if ((Test-Path -LiteralPath $pkgRoot -PathType Leaf) -and (Test-Path -LiteralPath $srcRoot -PathType Container)) {
        return $ExtractedDir
    }

    # パターン2: 単一の親フォルダでラップされている場合にも対応
    $topItems = @(Get-ChildItem -LiteralPath $ExtractedDir -Force)
    if ($topItems.Count -eq 1 -and $topItems[0].PSIsContainer) {
        $subDir = $topItems[0].FullName
        $pkgSub = Join-Path $subDir 'package.json'
        $srcSub = Join-Path $subDir 'src'
        if ((Test-Path -LiteralPath $pkgSub -PathType Leaf) -and (Test-Path -LiteralPath $srcSub -PathType Container)) {
            return $subDir
        }
    }

    return $null
}

function Get-AppVersionSummary {
    param(
        [Parameter(Mandatory = $true)][string]$RepoPath
    )

    $versionFile = Join-Path $RepoPath 'src\config\version.ts'
    if (-not (Test-Path -LiteralPath $versionFile -PathType Leaf)) {
        return $null
    }

    try {
        $content = Get-Content -LiteralPath $versionFile -Raw -Encoding UTF8
        $display = $null
        $desc = $null
        if ($content -match "display\s*:\s*'([^']+)'") {
            $display = $Matches[1]
        }
        if ($content -match "description\s*:\s*'([^']+)'") {
            $desc = $Matches[1]
        }
        if ($display -and $desc) {
            return "$display - $desc"
        }
        if ($display) {
            return $display
        }
    } catch {
        return $null
    }

    return $null
}

function Invoke-GitCommand {
    param(
        [Parameter(Mandatory = $true)][string]$GitExe,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $env:GIT_TERMINAL_PROMPT = '0'
    $fullArgs = @('-C', $RepoRoot, '-c', 'core.quotepath=false', '-c', 'credential.helper=manager') + $Arguments

    # Windows PowerShell 5.1 で Git の警告(warning)や進捗(stderr)が例外扱いになるのを防ぐ
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $raw = & $GitExe @fullArgs 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEAP
    }

    $stdOut = @()
    $stdErr = @()
    foreach ($entry in @($raw)) {
        if ($null -eq $entry) { continue }
        if ($entry -is [System.Management.Automation.ErrorRecord]) {
            $stdErr += $entry.Exception.Message
        } else {
            $stdOut += $entry.ToString()
        }
    }

    return [PSCustomObject]@{
        ExitCode = $exitCode
        StdOut   = $stdOut
        StdErr   = $stdErr
        Output   = @($stdOut + $stdErr)
    }
}

function Invoke-DeployFromZip {
    param(
        [Parameter(Mandatory = $true)][string]$ZipPath,
        [Parameter(Mandatory = $true)][string]$GitExe
    )

    $zipName = Split-Path -Leaf $ZipPath

    # ダウンロード途中の一時ファイルは無視
    if ($zipName -match '\.(crdownload|tmp|part)$' -or ([System.IO.Path]::GetExtension($ZipPath) -ine '.zip')) {
        return
    }

    Write-Log "新しいZIPを検知しました: $zipName" -Color Cyan
    Write-Log "書き込みロック解除とダウンロード完了を待機中（3秒待機）..." -Color DarkCyan

    if (-not (Wait-FileReady -Path $ZipPath -WaitSeconds 3 -TimeoutSeconds 60)) {
        Write-Log "ZIPファイルのロック解除を確認できなかったためスキップします: $zipName" -Color Yellow
        return
    }

    $tempDir = Join-Path $env:TEMP ("teranago-watch-deploy-" + [Guid]::NewGuid().ToString('N'))

    try {
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
        Write-Log "一時フォルダへ解凍して中身を検証中..." -Color DarkCyan

        try {
            [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $tempDir)
        } catch {
            Write-Log "ZIPの解凍に失敗しました（破損または対象外ファイル）: $($_.Exception.Message)" -Color Yellow
            return
        }

        # package.json と src フォルダの両方が存在するかチェック
        $sourceRoot = Resolve-AppSourceRoot -ExtractedDir $tempDir
        if (-not $sourceRoot) {
            Write-Log "対象外ZIP（package.json と src フォルダが見つかりません）のためスキップします: $zipName" -Color DarkGray
            return
        }

        Write-Log "本番アプリZIPと判定しました。既存ファイルのクリーンアップと展開を開始します..." -Color Cyan

        # 保護対象以外をすべて削除
        $existingItems = @(Get-ChildItem -LiteralPath $RepoRoot -Force)
        foreach ($item in $existingItems) {
            if ($ProtectedItems -contains $item.Name) {
                continue
            }
            Remove-Item -LiteralPath $item.FullName -Recurse -Force
        }

        # 解凍した最新コードをルート直下へコピー（保護対象は絶対に上書きしない）
        $newItems = @(Get-ChildItem -LiteralPath $sourceRoot -Force)
        foreach ($item in $newItems) {
            if ($ProtectedItems -contains $item.Name) {
                Write-Log "保護対象のため上書きをスキップ: $($item.Name)" -Color DarkYellow
                continue
            }
            Copy-Item -LiteralPath $item.FullName -Destination $RepoRoot -Recurse -Force
        }

        Write-Log "ファイル配置完了。Git ステージングと安全性チェックを実行します..." -Color Cyan

        # git add -A
        $addResult = Invoke-GitCommand -GitExe $GitExe -Arguments @('add', '-A')
        if ($addResult.ExitCode -ne 0) {
            Write-Log ("git add に失敗しました: " + ($addResult.Output -join "`n")) -Color Red
            return
        }

        # ステージング済みファイル一覧を取得
        $stagedResult = Invoke-GitCommand -GitExe $GitExe -Arguments @('diff', '--cached', '--name-only')
        if ($stagedResult.ExitCode -ne 0) {
            Write-Log ("git diff --cached の確認に失敗しました: " + ($stagedResult.Output -join "`n")) -Color Red
            return
        }

        $stagedFiles = @($stagedResult.StdOut | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        if ($stagedFiles.Count -eq 0) {
            Write-Log "変更差分がなかったため、コミット・プッシュをスキップしました。" -Color Yellow
            return
        }

        # .env / uploads/ / data/ が含まれていないか最終チェック
        $forbiddenHits = @($stagedFiles | Where-Object { $_ -match $ForbiddenStagePattern })
        if ($forbiddenHits.Count -gt 0) {
            Write-Log "【安全停止】禁止ファイルがステージングに含まれていたためコミットを中止します:" -Color Red
            foreach ($hit in $forbiddenHits) {
                Write-Host "  - $hit" -ForegroundColor Red
            }
            $null = Invoke-GitCommand -GitExe $GitExe -Arguments @('reset')
            return
        }

        Write-Log ("変更ファイル数: {0} 件（.env / uploads/ / data/ 混入なしを確認済み）" -f $stagedFiles.Count) -Color DarkCyan

        # コミットメッセージ生成
        $versionSummary = Get-AppVersionSummary -RepoPath $RepoRoot
        if ($versionSummary) {
            $commitSubject = "deploy: 自動反映 ($versionSummary)"
        } else {
            $commitSubject = "deploy: 自動反映 ($(Get-TimeStamp))"
        }
        $commitBody = "Source ZIP: $zipName`nFiles changed: $($stagedFiles.Count)"

        $commitResult = Invoke-GitCommand -GitExe $GitExe -Arguments @('commit', '-m', $commitSubject, '-m', $commitBody)
        if ($commitResult.ExitCode -ne 0) {
            Write-Log ("git commit に失敗しました: " + ($commitResult.Output -join "`n")) -Color Red
            return
        }

        Write-Log "origin/main へプッシュ中..." -Color Cyan
        $pushResult = Invoke-GitCommand -GitExe $GitExe -Arguments @('push', 'origin', 'main')
        if ($pushResult.ExitCode -ne 0) {
            Write-Log ("git push に失敗しました（認証またはネットワークを確認してください）:`n" + ($pushResult.Output -join "`n")) -Color Red
            return
        }

        Write-Log "本番反映完了！" -Color Green
    } catch {
        Write-Log "処理中にエラーが発生しました: $($_.Exception.Message)" -Color Red
    } finally {
        if (Test-Path -LiteralPath $tempDir) {
            Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

# =========================
# メイン処理（常時監視ループ）
# =========================
if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot '.git'))) {
    Write-Log "エラー: リポジトリルート ($RepoRoot) に .git フォルダが見つかりません。" -Color Red
    exit 1
}

if (-not (Test-Path -LiteralPath $DownloadsDir)) {
    Write-Log "エラー: ダウンロードフォルダ ($DownloadsDir) が見つかりません。" -Color Red
    exit 1
}

$GitExe = Find-GitExecutable
if (-not $GitExe) {
    Write-Log "エラー: git.exe が見つかりませんでした。GitHub Desktop または Git for Windows をインストールしてください。" -Color Red
    exit 1
}

# 認証プロンプトによるハング防止
$env:GIT_TERMINAL_PROMPT = '0'

Write-Host '============================================================' -ForegroundColor Cyan
Write-Host '  TERANAGO SNS 自動デプロイ監視ツール (watch-deploy.ps1)' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Log "監視対象フォルダ : $DownloadsDir" -Color White
Write-Log "反映先リポジトリ : $RepoRoot" -Color White
Write-Log "使用 Git コマンド : $GitExe" -Color White
Write-Log "保護対象         : $($ProtectedItems -join ', ')" -Color DarkGray
Write-Log "監視を開始しました（終了するには Ctrl+C を押してください）..." -Color Green

# 起動時に既に存在する ZIP ファイルは処理済みとして記録（誤爆防止）
$KnownZipSignatures = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($existingZip in @(Get-ChildItem -LiteralPath $DownloadsDir -Filter '*.zip' -File -ErrorAction SilentlyContinue)) {
    $sig = "{0}|{1}|{2}" -f $existingZip.FullName, $existingZip.LastWriteTimeUtc.Ticks, $existingZip.Length
    $null = $KnownZipSignatures.Add($sig)
}

# FileSystemWatcher で即時検知しつつ、取りこぼし防止の定期スキャンも併用
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $DownloadsDir
$watcher.Filter = '*.zip'
$watcher.IncludeSubdirectories = $false
$watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, Size'
$watcher.EnableRaisingEvents = $true

$createdSub = Register-ObjectEvent -InputObject $watcher -EventName Created -SourceIdentifier 'WatchDeploy_Created'
$renamedSub = Register-ObjectEvent -InputObject $watcher -EventName Renamed -SourceIdentifier 'WatchDeploy_Renamed'

try {
    while ($true) {
        # 最大2秒イベント待機（Ctrl+C で即座に中断可能）
        $evt = Wait-Event -Timeout 2
        if ($evt) {
            Remove-Event -EventIdentifier $evt.EventIdentifier -ErrorAction SilentlyContinue
        }

        # 現在の Downloads フォルダ内の .zip を確認（Created / Renamed 双方の取りこぼしを防止）
        $currentZips = @(Get-ChildItem -LiteralPath $DownloadsDir -Filter '*.zip' -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTimeUtc)

        foreach ($zip in $currentZips) {
            # 念のため一時ファイル拡張子を除外
            if ($zip.Name -match '\.(crdownload|tmp|part)$') {
                continue
            }

            $sig = "{0}|{1}|{2}" -f $zip.FullName, $zip.LastWriteTimeUtc.Ticks, $zip.Length
            if ($KnownZipSignatures.Contains($sig)) {
                continue
            }

            # 処理実行前に署名を記録し、完了後の最終署名も再記録する
            $null = $KnownZipSignatures.Add($sig)
            Invoke-DeployFromZip -ZipPath $zip.FullName -GitExe $GitExe

            if (Test-Path -LiteralPath $zip.FullName) {
                $refreshed = Get-Item -LiteralPath $zip.FullName -ErrorAction SilentlyContinue
                if ($refreshed) {
                    $finalSig = "{0}|{1}|{2}" -f $refreshed.FullName, $refreshed.LastWriteTimeUtc.Ticks, $refreshed.Length
                    $null = $KnownZipSignatures.Add($finalSig)
                }
            }
        }
    }
} finally {
    Write-Log "監視を停止しています..." -Color Yellow
    Unregister-Event -SourceIdentifier 'WatchDeploy_Created' -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier 'WatchDeploy_Renamed' -ErrorAction SilentlyContinue
    if ($watcher) {
        $watcher.EnableRaisingEvents = $false
        $watcher.Dispose()
    }
}
