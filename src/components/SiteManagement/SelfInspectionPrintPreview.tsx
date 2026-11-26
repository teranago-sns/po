import React, { useMemo, useRef } from 'react';
import { Printer, X, FileSpreadsheet } from 'lucide-react';
import {
  SelfInspectionCheckItemDef,
  SelfInspectionDoorRecord,
  SelfInspectionOfficeConfig,
  SelfInspectionRecord,
} from '../../types/selfInspection';
import {
  formatMountMethodForPrint,
  formatOpeningMethodForPrint,
  formatPowerSwitchForPrint,
} from '../../constants/selfInspectionMasters';

interface SelfInspectionPrintPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  record: SelfInspectionRecord;
  config: SelfInspectionOfficeConfig;
  onExportExcel?: () => void;
}

function formatJapaneseDate(dateStr?: string): { y: string; m: string; d: string } {
  if (!dateStr) return { y: '', m: '', d: '' };
  const m = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return { y: '', m: '', d: '' };
  return { y: m[1], m: String(parseInt(m[2], 10)), d: String(parseInt(m[3], 10)) };
}

/** センサー検知範囲図（PDF 1 準拠のクリーンな技術図SVG） */
const SensorCoverageDiagramSvg: React.FC = () => (
  <svg
    viewBox="0 0 360 116"
    className="w-full h-full max-h-[96px]"
    role="img"
    aria-label="センサー検知範囲図"
  >
    {/* 上部寸法矢印 ①② */}
    <text x="128" y="11" fontSize="9" fill="#0f172a" textAnchor="middle">② 150mm以上</text>
    <text x="234" y="11" fontSize="9" fill="#0f172a" textAnchor="middle">① 150mm以上</text>
    <line x1="108" y1="15" x2="140" y2="15" stroke="#0f172a" strokeWidth="0.8" />
    <line x1="220" y1="15" x2="252" y2="15" stroke="#0f172a" strokeWidth="0.8" />

    {/* 外センサー検知範囲 */}
    <rect x="108" y="20" width="144" height="24" fill="#e2e8f0" stroke="#334155" strokeWidth="0.9" />
    <text x="180" y="35" fontSize="9.5" fill="#0f172a" textAnchor="middle" fontWeight="600">
      外センサー検知範囲
    </text>

    {/* ③ 奥行き（外側） */}
    <line x1="262" y1="20" x2="262" y2="56" stroke="#0f172a" strokeWidth="0.8" />
    <line x1="258" y1="20" x2="266" y2="20" stroke="#0f172a" strokeWidth="0.8" />
    <line x1="258" y1="56" x2="266" y2="56" stroke="#0f172a" strokeWidth="0.8" />
    <text x="270" y="34" fontSize="8.5" fill="#0f172a">③奥行き</text>
    <text x="270" y="45" fontSize="8.5" fill="#0f172a">1000mm以上</text>

    {/* ④ ドア直近（外側不感知帯） */}
    <text x="180" y="51" fontSize="7.8" fill="#0f172a" textAnchor="middle">④ドア直近 150mm未満</text>

    {/* ドア芯・補助光線ライン */}
    <line x1="94" y1="56" x2="266" y2="56" stroke="#0f172a" strokeWidth="2" />
    <line x1="140" y1="56" x2="220" y2="56" stroke="#ffffff" strokeWidth="1.2" strokeDasharray="3 2" />
    {/* 建て枠 */}
    <rect x="134" y="52" width="6" height="8" fill="#0f172a" />
    <rect x="220" y="52" width="6" height="8" fill="#0f172a" />

    {/* ⑧ ドア直近（内側不感知帯） */}
    <text x="180" y="68" fontSize="7.8" fill="#0f172a" textAnchor="middle">*⑧ドア直近 150mm未満</text>

    {/* 内センサー検知範囲 */}
    <rect x="108" y="72" width="144" height="24" fill="#e2e8f0" stroke="#334155" strokeWidth="0.9" />
    <text x="180" y="87" fontSize="9.5" fill="#0f172a" textAnchor="middle" fontWeight="600">
      内センサー検知範囲
    </text>

    {/* ⑦ 奥行き（内側） */}
    <line x1="262" y1="56" x2="262" y2="96" stroke="#0f172a" strokeWidth="0.8" />
    <line x1="258" y1="96" x2="266" y2="96" stroke="#0f172a" strokeWidth="0.8" />
    <text x="270" y="77" fontSize="8.5" fill="#0f172a">⑦奥行き</text>
    <text x="270" y="88" fontSize="8.5" fill="#0f172a">1000mm以上</text>

    {/* 下部有効開口幅・凡例 */}
    <line x1="140" y1="103" x2="220" y2="103" stroke="#0f172a" strokeWidth="0.8" />
    <text x="180" y="113" fontSize="8.5" fill="#0f172a" textAnchor="middle">⑤ 有効開口幅 ⑥</text>
    <line x1="12" y1="109" x2="40" y2="109" stroke="#0f172a" strokeWidth="2.5" strokeDasharray="3 2" />
    <text x="45" y="112" fontSize="8" fill="#0f172a">補助光線</text>
    <text x="234" y="112" fontSize="7.5" fill="#475569">*⑧内側にも補助光線がある場合</text>
  </svg>
);

export const SelfInspectionPrintPreview: React.FC<SelfInspectionPrintPreviewProps> = ({
  isOpen,
  onClose,
  record,
  config,
  onExportExcel,
}) => {
  const printAreaRef = useRef<HTMLDivElement>(null);

  // 5台ごとに自動改ページチャンク分割
  const pages = useMemo<Array<Array<SelfInspectionDoorRecord | null>>>(() => {
    const doors = record.doors && record.doors.length > 0 ? record.doors : [];
    const totalPages = Math.max(1, Math.ceil(doors.length / 5));
    const result: Array<Array<SelfInspectionDoorRecord | null>> = [];
    for (let p = 0; p < totalPages; p++) {
      const slice: Array<SelfInspectionDoorRecord | null> = [];
      for (let slot = 0; slot < 5; slot++) {
        slice.push(doors[p * 5 + slot] || null);
      }
      result.push(slice);
    }
    return result;
  }, [record.doors]);

  // 有効なチェック項目をカテゴリ別に整理
  const activeItemsByCategory = useMemo(() => {
    const map = new Map<string, SelfInspectionCheckItemDef[]>();
    const active = config.checkItems
      .filter((i) => i.isActive && i.showInPrint !== false)
      .sort((a, b) => a.order - b.order);
    for (const item of active) {
      const arr = map.get(item.category) || [];
      arr.push(item);
      map.set(item.category, arr);
    }
    return map;
  }, [config.checkItems]);

  // 標準外にユーザーが追加したカスタムカテゴリ
  const standardCategoryIds = new Set([
    'power',
    'door',
    'sensor_outer',
    'sensor_inner',
    'special',
    'overall',
    'safety',
  ]);
  const customCategories = useMemo(
    () =>
      config.categories
        .filter((c) => !standardCategoryIds.has(c.id))
        .sort((a, b) => a.order - b.order),
    [config.categories]
  );

  const handlePrint = () => {
    const printEl = printAreaRef.current;
    if (!printEl) return;

    // クリーンな非表示 iframe で印刷することでアプリ側のモーダルや背景を一切巻き込まない
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }

    const escapeHtml = (str: string) =>
      str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safeDocTitle = escapeHtml(record.siteName || record.siteCode || '');

    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>自動ドア自主検査書 - ${safeDocTitle}</title>
<style>
  @page { size: A4 portrait; margin: 7mm 8mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { margin: 0; padding: 0; font-family: "Meiryo", "Yu Gothic", "Hiragino Kaku Gothic ProN", sans-serif; color: #0f172a; background: #fff; }
  .print-page { width: 100%; page-break-after: always; break-after: page; padding: 0; }
  .print-page:last-child { page-break-after: auto; break-after: auto; }
  .header-grid { display: flex; justify-content: space-between; align-items: stretch; gap: 6px; margin-bottom: 4px; }
  .header-left { width: 32%; }
  .header-center { width: 42%; display: flex; align-items: center; justify-content: center; }
  .header-right { width: 26%; display: flex; flex-direction: column; justify-content: flex-start; }
  .doc-title { font-size: 16px; font-weight: 800; text-decoration: underline; text-underline-offset: 3px; letter-spacing: 0.08em; margin: 0 0 4px 0; }
  .company-name { font-size: 10.5px; font-weight: 700; text-align: right; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #1e293b; padding: 1.5px 3px; font-size: 8.5px; line-height: 1.25; vertical-align: middle; overflow-wrap: break-word; }
  .meta-table th { background: #f8fafc; font-weight: 700; text-align: center; width: 34%; }
  .meta-table td { text-align: center; font-weight: 600; }
  .stamp-table th { background: #f8fafc; font-weight: 700; text-align: center; height: 16px; }
  .stamp-table td { height: 42px; text-align: center; vertical-align: middle; font-size: 10px; font-weight: 700; }
  .main-table { border: 1.5px solid #0f172a; }
  .cat-cell { writing-mode: vertical-rl; text-orientation: upright; text-align: center; font-weight: 700; background: #f8fafc; width: 22px; padding: 2px 1px; letter-spacing: 0.05em; }
  .sub-cat-cell { text-align: center; font-weight: 700; background: #f8fafc; width: 20px; }
  .item-label { text-align: left; padding-left: 4px; }
  .val-cell { text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; }
  .no-header { background: #f1f5f9; font-weight: 800; text-align: center; font-size: 9.5px; }
  .notes-box { min-height: 36px; text-align: left; vertical-align: top; padding: 3px 5px; white-space: pre-wrap; font-size: 8.5px; }
  .page-num { text-align: right; font-size: 8px; color: #475569; margin-bottom: 1px; }
</style>
</head>
<body>${printEl.innerHTML}</body>
</html>`);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 1500);
    }, 250);
  };

  if (!isOpen) return null;

  const dateParts = formatJapaneseDate(record.inspectionDate);
  const powerItems = activeItemsByCategory.get('power') || [];
  const doorItems = activeItemsByCategory.get('door') || [];
  const outerSensorItems = activeItemsByCategory.get('sensor_outer') || [];
  const innerSensorItems = (activeItemsByCategory.get('sensor_inner') || []).filter((i) => i.key !== 'beam_optical_axis');
  const beamOpticalItem = (activeItemsByCategory.get('sensor_inner') || []).find((i) => i.key === 'beam_optical_axis');
  const specialItems = activeItemsByCategory.get('special') || [];
  const overallItems = activeItemsByCategory.get('overall') || [];
  const safetyItems = activeItemsByCategory.get('safety') || [];

  const renderCheckValue = (door: SelfInspectionDoorRecord | null, item: SelfInspectionCheckItemDef) => {
    if (!door) return '';
    const val = door.checkResults?.[item.key] ?? '';
    if (!val) return '';
    return item.unit && item.inputType === 'number' ? `${val}${item.unit}` : val;
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-xs flex flex-col">
      {/* 上部ツールバー */}
      <div className="bg-slate-900 text-white px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="font-bold text-sm whitespace-nowrap">
            自動ドア自主検査書 印刷プレビュー
          </h3>
          <span className="text-xs text-slate-300 font-mono tabular-nums whitespace-nowrap">
            全 {record.doors.length} 台 · {pages.length} ページ（5台ごとに自動改ページ）
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>CRM用Excel出力</span>
            </button>
          )}
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>印刷 / PDF保存</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* プレビュー本体（A4縦シートのスクロール領域） */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-200/90">
        <div ref={printAreaRef} className="max-w-[820px] mx-auto space-y-6">
          {pages.map((pageDoors, pageIdx) => {
            const sensorTotalRows =
              2 + outerSensorItems.length + 2 + innerSensorItems.length + (beamOpticalItem ? 1 : 0) + 1;

            return (
              <div
                key={`page-${pageIdx}`}
                className="print-page bg-white shadow-md border border-slate-300 p-5 text-slate-900"
              >
                <div className="page-num text-right text-[10px] text-slate-500 mb-0.5 font-mono tabular-nums">
                  {pageIdx + 1} / {pages.length}
                </div>

                {/* ヘッダー3カラム（見本PDF 1準拠） */}
                <div className="header-grid flex justify-between items-stretch gap-2 mb-1.5">
                  {/* 左: タイトル + 現場メタ表 */}
                  <div className="header-left w-[33%]">
                    <div className="doc-title text-[16px] font-extrabold underline underline-offset-2 tracking-wider mb-1">
                      自動ドア自主検査書
                    </div>
                    <table className="meta-table w-full border-collapse text-[10px]">
                      <tbody>
                        <tr>
                          <th className="border border-slate-800 bg-slate-50 px-1.5 py-0.5 font-bold w-[34%]">
                            図面番号
                          </th>
                          <td className="border border-slate-800 px-1.5 py-0.5 text-center font-mono font-semibold">
                            {record.drawingNo || ''}
                          </td>
                        </tr>
                        <tr>
                          <th className="border border-slate-800 bg-slate-50 px-1.5 py-0.5 font-bold">
                            検査日
                          </th>
                          <td className="border border-slate-800 px-1.5 py-0.5 text-center font-mono">
                            {dateParts.y ? `${dateParts.y} 年 ${dateParts.m} 月 ${dateParts.d} 日` : '年　　月　　日'}
                          </td>
                        </tr>
                        <tr>
                          <th className="border border-slate-800 bg-slate-50 px-1.5 py-0.5 font-bold">
                            現場名
                          </th>
                          <td className="border border-slate-800 px-1.5 py-0.5 text-center font-bold">
                            {record.siteName || ''}
                          </td>
                        </tr>
                        <tr>
                          <th className="border border-slate-800 bg-slate-50 px-1.5 py-0.5 font-bold">
                            現場コード
                          </th>
                          <td className="border border-slate-800 px-1.5 py-0.5 text-center font-mono font-semibold">
                            {record.siteCode || ''}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 中央: センサー検知範囲図 */}
                  <div className="header-center w-[42%] flex items-center justify-center px-1">
                    <SensorCoverageDiagramSvg />
                  </div>

                  {/* 右: 会社名 + 検印（空欄） / 担当 */}
                  <div className="header-right w-[25%] flex flex-col justify-start">
                    <div className="company-name text-[10.5px] font-bold text-right mb-1">
                      寺岡オート・ドアシステム株式会社
                    </div>
                    <table className="stamp-table w-full border-collapse text-[10px]">
                      <thead>
                        <tr>
                          <th className="border border-slate-800 bg-slate-50 py-0.5 font-bold w-1/2">検印</th>
                          <th className="border border-slate-800 bg-slate-50 py-0.5 font-bold w-1/2">担当</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {/* 検印は仕様通り空欄 */}
                          <td className="border border-slate-800 h-12 text-center align-middle" />
                          <td className="border border-slate-800 h-12 text-center align-middle font-bold text-[11px]">
                            {record.inspectorName || ''}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* メイン検査表 */}
                <table className="main-table w-full border-collapse border-[1.5px] border-slate-900 text-[9px]">
                  <colgroup>
                    <col style={{ width: '24px' }} />
                    <col style={{ width: '22px' }} />
                    <col style={{ width: '40%' }} />
                    <col style={{ width: '10.6%' }} />
                    <col style={{ width: '10.6%' }} />
                    <col style={{ width: '10.6%' }} />
                    <col style={{ width: '10.6%' }} />
                    <col style={{ width: '10.6%' }} />
                  </colgroup>
                  <tbody>
                    {/* 扉諸元 (8行) */}
                    <tr>
                      <th rowSpan={8} className="cat-cell border border-slate-800 bg-slate-50 font-bold text-center">
                        扉諸元
                      </th>
                      <td colSpan={2} className="border border-slate-800 text-center font-bold bg-slate-50 py-0.5">
                        NO
                      </td>
                      {pageDoors.map((d, slot) => (
                        <td key={`no-${slot}`} className="no-header border border-slate-800 bg-slate-100 text-center font-bold font-mono">
                          {d ? d.doorIndex : pageIdx * 5 + slot + 1}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td colSpan={2} className="border border-slate-800 text-center py-0.5">階数</td>
                      {pageDoors.map((d, slot) => (
                        <td key={`fl-${slot}`} className="val-cell border border-slate-800 text-center">{d?.floor || ''}</td>
                      ))}
                    </tr>
                    <tr>
                      <td colSpan={2} className="border border-slate-800 text-center py-0.5">建具番号</td>
                      {pageDoors.map((d, slot) => (
                        <td key={`fn-${slot}`} className="val-cell border border-slate-800 text-center font-mono">{d?.fittingNo || ''}</td>
                      ))}
                    </tr>
                    <tr>
                      <td colSpan={2} className="border border-slate-800 text-center py-0.5">エンジン機種</td>
                      {pageDoors.map((d, slot) => (
                        <td key={`em-${slot}`} className="val-cell border border-slate-800 text-center font-mono">{d?.engineModel || ''}</td>
                      ))}
                    </tr>
                    <tr>
                      <td colSpan={2} className="border border-slate-800 text-center py-0.5">エンジン シリアルNo.</td>
                      {pageDoors.map((d, slot) => (
                        <td key={`sn-${slot}`} className="val-cell border border-slate-800 text-center font-mono">{d?.engineSerialNo || ''}</td>
                      ))}
                    </tr>
                    <tr>
                      <td colSpan={2} className="item-label border border-slate-800 px-1 py-0.5">
                        ドア種類： 1.框 2.強化ガラス 3.フラッシュ 4.格子 5.その他
                      </td>
                      {pageDoors.map((d, slot) => (
                        <td key={`dt-${slot}`} className="val-cell border border-slate-800 text-center">{d?.doorType || ''}</td>
                      ))}
                    </tr>
                    <tr>
                      <td colSpan={2} className="item-label border border-slate-800 px-1 py-0.5">
                        開閉方式： 1.片引き 2.両引き 3.２連引き 4.フルオープン 5.折れ戸
                      </td>
                      {pageDoors.map((d, slot) => (
                        <td key={`om-${slot}`} className="val-cell border border-slate-800 text-center">
                          {formatOpeningMethodForPrint(d?.openingMethod)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td colSpan={2} className="item-label border border-slate-800 px-1 py-0.5">
                        取付方法： 1.無目内蔵 2.天井内取付 3.直付け 4.地下埋設
                      </td>
                      {pageDoors.map((d, slot) => (
                        <td key={`mm-${slot}`} className="val-cell border border-slate-800 text-center">
                          {formatMountMethodForPrint(d?.mountMethod)}
                        </td>
                      ))}
                    </tr>

                    {/* 電源・配線 */}
                    <tr>
                      <th rowSpan={1 + powerItems.length} className="cat-cell border border-slate-800 bg-slate-50 font-bold text-center">
                        電源配線
                      </th>
                      <td colSpan={2} className="item-label border border-slate-800 px-1 py-0.5">
                        電源スイッチの位置　1.内観左　2.中央　3.内観右
                      </td>
                      {pageDoors.map((d, slot) => (
                        <td key={`ps-${slot}`} className="val-cell border border-slate-800 text-center">
                          {formatPowerSwitchForPrint(d?.powerSwitchPos)}
                        </td>
                      ))}
                    </tr>
                    {powerItems.map((item) => (
                      <tr key={item.key}>
                        <td colSpan={2} className="item-label border border-slate-800 px-1 py-0.5">{item.label}</td>
                        {pageDoors.map((d, slot) => (
                          <td key={`${item.key}-${slot}`} className="val-cell border border-slate-800 text-center">
                            {renderCheckValue(d, item)}
                          </td>
                        ))}
                      </tr>
                    ))}

                    {/* 扉関係 */}
                    <tr>
                      <th rowSpan={1 + doorItems.length} className="cat-cell border border-slate-800 bg-slate-50 font-bold text-center">
                        扉関係
                      </th>
                      <td colSpan={2} className="border border-slate-800 text-center py-0.5">有効開口（mm）</td>
                      {pageDoors.map((d, slot) => (
                        <td key={`eo-${slot}`} className="val-cell border border-slate-800 text-center font-mono">
                          {d?.effectiveOpeningMm || ''}
                        </td>
                      ))}
                    </tr>
                    {doorItems.map((item) => (
                      <tr key={item.key}>
                        <td colSpan={2} className="item-label border border-slate-800 px-1 py-0.5">{item.label}</td>
                        {pageDoors.map((d, slot) => (
                          <td key={`${item.key}-${slot}`} className="val-cell border border-slate-800 text-center">
                            {renderCheckValue(d, item)}
                          </td>
                        ))}
                      </tr>
                    ))}

                    {/* 動作 */}
                    <tr>
                      <th rowSpan={3} className="cat-cell border border-slate-800 bg-slate-50 font-bold text-center">
                        動作
                      </th>
                      <td colSpan={2} className="item-label border border-slate-800 px-1 py-0.5">
                        開速度（9・8・7・6・5・4・3・2・1） or （mm/sec）
                      </td>
                      {pageDoors.map((d, slot) => (
                        <td key={`os-${slot}`} className="val-cell border border-slate-800 text-center font-mono">{d?.openSpeed || ''}</td>
                      ))}
                    </tr>
                    <tr>
                      <td colSpan={2} className="item-label border border-slate-800 px-1 py-0.5">
                        閉速度（9・8・7・6・5・4・3・2・1） or （mm/sec）
                      </td>
                      {pageDoors.map((d, slot) => (
                        <td key={`cs-${slot}`} className="val-cell border border-slate-800 text-center font-mono">{d?.closeSpeed || ''}</td>
                      ))}
                    </tr>
                    <tr>
                      <td colSpan={2} className="border border-slate-800 text-center py-0.5">開き保持時間（秒）</td>
                      {pageDoors.map((d, slot) => (
                        <td key={`ht-${slot}`} className="val-cell border border-slate-800 text-center font-mono">{d?.holdOpenTimeSec || ''}</td>
                      ))}
                    </tr>

                    {/* 起動センサー（EGボックスより観て） */}
                    <tr>
                      <th rowSpan={sensorTotalRows} className="cat-cell border border-slate-800 bg-slate-50 font-bold text-center">
                        起動センサー（EGボックスより観て）
                      </th>
                      <th rowSpan={2 + outerSensorItems.length} className="sub-cat-cell border border-slate-800 bg-slate-50 text-center font-bold">
                        外<br />側
                      </th>
                      <td className="border border-slate-800 text-center py-0.5">起動センサー　型式</td>
                      {pageDoors.map((d, slot) => (
                        <td key={`osm-${slot}`} className="val-cell border border-slate-800 text-center font-mono">{d?.outerSensorMain || ''}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="border border-slate-800 text-center py-0.5">補助センサー　型式</td>
                      {pageDoors.map((d, slot) => (
                        <td key={`oss-${slot}`} className="val-cell border border-slate-800 text-center font-mono">{d?.outerSensorSub || ''}</td>
                      ))}
                    </tr>
                    {outerSensorItems.map((item) => (
                      <tr key={item.key}>
                        <td className="item-label border border-slate-800 px-1 py-0.5">{item.label}</td>
                        {pageDoors.map((d, slot) => (
                          <td key={`${item.key}-${slot}`} className="val-cell border border-slate-800 text-center">
                            {renderCheckValue(d, item)}
                          </td>
                        ))}
                      </tr>
                    ))}

                    <tr>
                      <th rowSpan={2 + innerSensorItems.length} className="sub-cat-cell border border-slate-800 bg-slate-50 text-center font-bold">
                        内<br />側
                      </th>
                      <td className="border border-slate-800 text-center py-0.5">起動センサー　型式</td>
                      {pageDoors.map((d, slot) => (
                        <td key={`ism-${slot}`} className="val-cell border border-slate-800 text-center font-mono">{d?.innerSensorMain || ''}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="border border-slate-800 text-center py-0.5">補助センサー　型式</td>
                      {pageDoors.map((d, slot) => (
                        <td key={`iss-${slot}`} className="val-cell border border-slate-800 text-center font-mono">{d?.innerSensorSub || ''}</td>
                      ))}
                    </tr>
                    {innerSensorItems.map((item) => (
                      <tr key={item.key}>
                        <td className="item-label border border-slate-800 px-1 py-0.5">{item.label}</td>
                        {pageDoors.map((d, slot) => (
                          <td key={`${item.key}-${slot}`} className="val-cell border border-slate-800 text-center">
                            {renderCheckValue(d, item)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {beamOpticalItem && (
                      <tr>
                        <td colSpan={2} className="item-label border border-slate-800 px-1 py-0.5">
                          {beamOpticalItem.label}
                          {pageDoors.some((d) => d?.beamSensor) ? '（型式は下部/詳細参照）' : ''}
                        </td>
                        {pageDoors.map((d, slot) => (
                          <td key={`beam-${slot}`} className="val-cell border border-slate-800 text-center">
                            {renderCheckValue(d, beamOpticalItem)}
                            {d?.beamSensor && !renderCheckValue(d, beamOpticalItem) ? d.beamSensor : ''}
                          </td>
                        ))}
                      </tr>
                    )}
                    <tr>
                      <td colSpan={2} className="border border-slate-800 text-center py-0.5">その他起動スイッチ</td>
                      {pageDoors.map((d, slot) => (
                        <td key={`osw-${slot}`} className="val-cell border border-slate-800 text-center">{d?.otherSwitch || ''}</td>
                      ))}
                    </tr>

                    {/* 特殊仕様 */}
                    {specialItems.length > 0 && (
                      <>
                        {specialItems.map((item, idx) => (
                          <React.Fragment key={item.key}>
                            <tr>
                              {idx === 0 && (
                                <th rowSpan={specialItems.length + 1} className="cat-cell border border-slate-800 bg-slate-50 font-bold text-center">
                                  特殊仕様
                                </th>
                              )}
                              <td colSpan={2} className="item-label border border-slate-800 px-1 py-0.5">{item.label}</td>
                              {pageDoors.map((d, slot) => (
                                <td key={`${item.key}-${slot}`} className="val-cell border border-slate-800 text-center">
                                  {renderCheckValue(d, item)}
                                </td>
                              ))}
                            </tr>
                            {item.key === 'fire_interlock_wiring' && (
                              <tr>
                                <td colSpan={2} className="item-label border border-slate-800 px-1 py-0.5 pl-4">
                                  → 火報信号　1.オープン　2.クローズ
                                </td>
                                {pageDoors.map((d, slot) => (
                                  <td key={`fa-${slot}`} className="val-cell border border-slate-800 text-center">
                                    {d?.fireAlarmSignal && d.fireAlarmSignal !== '無' ? d.fireAlarmSignal : ''}
                                  </td>
                                ))}
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </>
                    )}

                    {/* 総合動作 */}
                    {overallItems.map((item, idx) => (
                      <tr key={item.key}>
                        {idx === 0 && (
                          <th rowSpan={overallItems.length} className="cat-cell border border-slate-800 bg-slate-50 font-bold text-center">
                            総合動作
                          </th>
                        )}
                        <td colSpan={2} className="item-label border border-slate-800 px-1 py-0.5">{item.label}</td>
                        {pageDoors.map((d, slot) => (
                          <td key={`${item.key}-${slot}`} className="val-cell border border-slate-800 text-center">
                            {renderCheckValue(d, item)}
                          </td>
                        ))}
                      </tr>
                    ))}

                    {/* 安全 */}
                    {safetyItems.map((item, idx) => (
                      <tr key={item.key}>
                        {idx === 0 && (
                          <th rowSpan={safetyItems.length} className="cat-cell border border-slate-800 bg-slate-50 font-bold text-center">
                            安全
                          </th>
                        )}
                        <td colSpan={2} className="item-label border border-slate-800 px-1 py-0.5">{item.label}</td>
                        {pageDoors.map((d, slot) => (
                          <td key={`${item.key}-${slot}`} className="val-cell border border-slate-800 text-center">
                            {renderCheckValue(d, item)}
                          </td>
                        ))}
                      </tr>
                    ))}

                    {/* 拠点独自に増設されたカスタムカテゴリ */}
                    {customCategories.map((cat) => {
                      const catItems = activeItemsByCategory.get(cat.id) || [];
                      if (catItems.length === 0) return null;
                      return catItems.map((item, idx) => (
                        <tr key={item.key}>
                          {idx === 0 && (
                            <th rowSpan={catItems.length} className="cat-cell border border-slate-800 bg-slate-50 font-bold text-center">
                              {cat.name}
                            </th>
                          )}
                          <td colSpan={2} className="item-label border border-slate-800 px-1 py-0.5">
                            {item.label}
                            {item.unit ? `（${item.unit}）` : ''}
                          </td>
                          {pageDoors.map((d, slot) => (
                            <td key={`${item.key}-${slot}`} className="val-cell border border-slate-800 text-center">
                              {renderCheckValue(d, item)}
                            </td>
                          ))}
                        </tr>
                      ));
                    })}

                    {/* 連絡事項 */}
                    <tr>
                      <th className="cat-cell border border-slate-800 bg-slate-50 font-bold text-center">
                        連絡事項
                      </th>
                      <td colSpan={7} className="notes-box border border-slate-800 p-1.5 min-h-[42px] whitespace-pre-wrap align-top">
                        {record.contactNotes || ''}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
