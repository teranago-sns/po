/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.26.8',
  date: '2026-11-26',
  releaseNumber: 8,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.26 #8 (JST)',
  description: '自動ドア自主検査書の入力・A4印刷（5台ごと改ページ）・72列CRM連携Excel(.xlsx)出力・在庫DB自動適合・拠点別様式カスタマイズ（管理画面＋NAS永続化）を実装'
} as const;
