/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.27.1',
  date: '2026-11-27',
  releaseNumber: 1,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.27 #1 (JST)',
  description: '各建具（主要部品）の真下に該当建具の付属部品トグル・展開表示を配置し、建具符号なし・EG対象外の付属部品を下部一覧へ集約'
} as const;
