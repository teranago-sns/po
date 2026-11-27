/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.27.2',
  date: '2026-11-27',
  releaseNumber: 2,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.27 #2 (JST)',
  description: '個人設定・プッシュ通知設定モーダルを画面遷移せず現在表示中の画面上へポップアップ表示できるよう改修'
} as const;
