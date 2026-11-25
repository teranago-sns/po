/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.25.3',
  date: '2026-11-25',
  releaseNumber: 3,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.25 #3 (JST)',
  description: '単発予定削除時の繰り返し予定誤判定バグ修正（編集画面の単発削除確認対応）および予定再編集時の拠点・部署all上書き不具合の修正'
} as const;
