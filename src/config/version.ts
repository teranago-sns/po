/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.27.4',
  date: '2026-11-27',
  releaseNumber: 4,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.27 #4 (JST)',
  description: '点検予定管理にて、確定済みの点検予定でも備考および連絡・手配ステータスを編集できるよう改善'
} as const;
