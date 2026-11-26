import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Copy,
  Database,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  Save,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { Site } from '../../types/site';
import { OfficeMaster, User } from '../../types';
import { API_BASE_URL } from '../../config/api';
import {
  InventoryPartCandidate,
  SelfInspectionCheckItemDef,
  SelfInspectionDoorRecord,
  SelfInspectionOfficeConfig,
  SelfInspectionRecord,
} from '../../types/selfInspection';
import {
  BASEPLATE_MASTERS,
  BELT_MASTERS,
  BUILDING_USE_MASTERS,
  CB_MASTERS,
  DOOR_TYPE_MASTERS,
  EG_MOUNT_MASTERS,
  ELECTRIC_LOCK_MASTERS,
  FIRE_ALARM_SIGNAL_OPTIONS,
  FIRE_EQUIPMENT_MASTERS,
  GLASS_MASTERS,
  MATERIAL_MASTERS,
  MOTOR_MASTERS,
  OPENING_METHOD_MASTERS,
  POWER_SWITCH_MASTERS,
  ROLLER_MASTERS,
  SENSOR_MASTERS,
  STICKER_MASTERS,
  SUB_SENSOR_MASTERS,
  YES_NO_MASTERS,
  createDefaultSelfInspectionOfficeConfig,
} from '../../constants/selfInspectionMasters';
import {
  buildInitialSelfInspectionFromSite,
  createEmptySelfInspectionDoor,
  enrichDoorWithInventoryParts,
  exportSelfInspectionToCrmExcel,
  fetchSelfInspectionBySiteId,
  fetchSelfInspectionOfficeConfigs,
  normalizeForMatch,
  resolveEffectiveOfficeConfig,
  saveSelfInspectionRecord,
} from '../../utils/selfInspectionUtils';
import { SelfInspectionPrintPreview } from './SelfInspectionPrintPreview';

interface SiteSelfInspectionTabProps {
  currentSite: Site;
  currentUser: User;
  offices?: OfficeMaster[];
  liveSubParts?: Array<Record<string, any>>;
}

/** 検索・自由入力対応コンボボックス（datalist 利用でマスター候補＋手入力の両立） */
const MasterComboInput: React.FC<{
  listId: string;
  options: string[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ listId, options, value, onChange, placeholder, className }) => (
  <>
    <input
      type="text"
      list={listId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={
        className ||
        'w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500'
      }
    />
    <datalist id={listId}>
      {options.map((opt) => (
        <option key={opt} value={opt} />
      ))}
    </datalist>
  </>
);

export const SiteSelfInspectionTab: React.FC<SiteSelfInspectionTabProps> = ({
  currentSite,
  currentUser,
  offices = [],
  liveSubParts = [],
}) => {
  const [allConfigs, setAllConfigs] = useState<SelfInspectionOfficeConfig[]>([
    createDefaultSelfInspectionOfficeConfig(),
  ]);
  const [record, setRecord] = useState<SelfInspectionRecord | null>(null);
  const [selectedDoorIdx, setSelectedDoorIdx] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavedRecord, setIsSavedRecord] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingInventory, setIsSyncingInventory] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [showCrmHeader, setShowCrmHeader] = useState(false);
  const [showCrmDoorDetails, setShowCrmDoorDetails] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // 適用する拠点設定を解決
  const effectiveConfig = useMemo<SelfInspectionOfficeConfig>(() => {
    const targetOfficeId = record?.officeId || currentUser.officeId || 'default';
    return resolveEffectiveOfficeConfig(allConfigs, targetOfficeId);
  }, [allConfigs, record?.officeId, currentUser.officeId]);

  // 初期ロード（拠点別様式マスター ＋ 保存済み自主検査書）
  useEffect(() => {
    let active = true;
    const init = async () => {
      setIsLoading(true);
      setStatusNotice(null);
      try {
        const [configs, existing] = await Promise.all([
          fetchSelfInspectionOfficeConfigs(),
          fetchSelfInspectionBySiteId(currentSite.id),
        ]);
        if (!active) return;

        setAllConfigs(configs);
        const targetOfficeId = existing?.officeId || currentUser.officeId || 'default';
        const resolvedCfg = resolveEffectiveOfficeConfig(configs, targetOfficeId);

        if (existing && Array.isArray(existing.doors) && existing.doors.length > 0) {
          setRecord(existing);
          setIsSavedRecord(true);
        } else {
          const draft = buildInitialSelfInspectionFromSite(
            currentSite,
            currentUser,
            resolvedCfg,
            liveSubParts
          );
          setRecord(draft);
          setIsSavedRecord(false);
        }
        setSelectedDoorIdx(0);
      } catch (err) {
        if (!active) return;
        const fallbackCfg = createDefaultSelfInspectionOfficeConfig();
        setRecord(buildInitialSelfInspectionFromSite(currentSite, currentUser, fallbackCfg, liveSubParts));
        setIsSavedRecord(false);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    init();
    return () => {
      active = false;
    };
  }, [currentSite.id]);

  // 在庫DBから最新部品明細を取得して自動適合
  const handleSyncFromInventory = async () => {
    if (!record) return;
    if (!record.siteCode?.trim()) {
      setStatusNotice({
        type: 'info',
        message: '現場コードが未設定のため在庫DBから照会できません。現場詳細情報または主要部品タブで現場コードを設定してください。',
      });
      return;
    }

    setIsSyncingInventory(true);
    setStatusNotice(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/sites/lookup/external?code=${encodeURIComponent(record.siteCode.trim())}`
      );
      if (!res.ok) throw new Error(`在庫DB照会に失敗しました (HTTP ${res.status})`);
      const json = await res.json();
      const payload = json?.data || json;
      const extParts: Array<Record<string, any>> = [
        ...(Array.isArray(payload?.parts) ? payload.parts : []),
        ...(Array.isArray(payload?.allParts) ? payload.allParts : []),
        ...(Array.isArray(payload?.items) ? payload.items : []),
        ...(Array.isArray(payload?.components) ? payload.components : []),
      ];

      // 重複除去
      const seen = new Set<string>();
      const dedupParts = extParts.filter((p) => {
        const key = `${p.fittingNo || p.建具番号 || ''}|${p.partName || p.name || p.品名 || ''}|${p.partSpec || p.部品規格 || ''}|${p.partCode || p.code || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const byFitting = new Map<string, InventoryPartCandidate[]>();
      const unassigned: InventoryPartCandidate[] = [];

      for (const p of dedupParts) {
        const fNo = String(p.fittingNo || p.建具番号 || p.tateguNo || p.fitting_no || '').trim();
        const cand: InventoryPartCandidate = {
          id: p.id ? String(p.id) : undefined,
          fittingNo: fNo || undefined,
          partName: String(p.partName || p.name || p.品名 || '').trim(),
          partSpec: String(p.partSpec || p.部品規格 || '').trim() || undefined,
          partCode: String(p.partCode || p.modelNumber || p.code || '').trim() || undefined,
          partCategory: p.partCategory,
          quantity: Number(p.quantity || p.count || 1) || 1,
          inStockDate: p.inStockDate || p.inboundDate,
          outStockDate: p.outStockDate || p.outboundDate,
          status: p.status || p.stockStatus,
        };
        if (!cand.partName && !cand.partCode) continue;
        if (fNo) {
          const k = normalizeForMatch(fNo);
          const list = byFitting.get(k) || [];
          list.push(cand);
          byFitting.set(k, list);
        } else {
          unassigned.push(cand);
        }
      }

      let enrichedDoorsCount = 0;
      const updatedDoors = record.doors.map((door) => {
        const key = normalizeForMatch(door.fittingNo);
        const candidates = [...(key ? byFitting.get(key) || [] : [])];
        if (record.doors.length === 1 && unassigned.length > 0) {
          candidates.push(...unassigned);
        }
        // 主要部品自身の情報も維持
        const existingCands = door.inventoryCandidates || [];
        for (const ec of existingCands) {
          if (!candidates.some((c) => c.partName === ec.partName && c.partSpec === ec.partSpec)) {
            candidates.push(ec);
          }
        }
        if (candidates.length > 0) enrichedDoorsCount++;
        return enrichDoorWithInventoryParts(door, candidates, effectiveConfig, {
          overwriteExisting: false,
        });
      });

      // 現場ヘッダー側の空欄も在庫DBから補完（既存手入力は上書きしない）
      const siteObj = payload?.site && typeof payload.site === 'object' ? payload.site : payload;
      setRecord((prev) =>
        prev
          ? {
              ...prev,
              drawingNo: prev.drawingNo || siteObj?.drawingNo || siteObj?.orderNo || '',
              contractClient: prev.contractClient || siteObj?.contractClient || siteObj?.customerName || siteObj?.client || '',
              buildingAddress: prev.buildingAddress || siteObj?.address || '',
              constructionCompany: prev.constructionCompany || siteObj?.constructionCompany || siteObj?.customerName || '',
              designOffice: prev.designOffice || siteObj?.designOffice || '',
              sashVendor: prev.sashVendor || siteObj?.sashVendor || '',
              ownerName: prev.ownerName || siteObj?.ownerName || '',
              buildingUse: prev.buildingUse || siteObj?.buildingUse || '',
              doors: updatedDoors,
            }
          : prev
      );

      setStatusNotice({
        type: 'success',
        message:
          dedupParts.length > 0
            ? `在庫DBから ${dedupParts.length}件の部品明細を取得し、${enrichedDoorsCount}台へ自動適合・候補反映しました（既存の手入力項目は保持されています）。`
            : '在庫DBと接続しましたが、この現場コードに紐づく追加部品明細は見つかりませんでした。',
      });
    } catch (err: any) {
      setStatusNotice({
        type: 'error',
        message: err?.message || '在庫DBからの取得中にエラーが発生しました。',
      });
    } finally {
      setIsSyncingInventory(false);
    }
  };

  // 保存（NAS SQL Server + JSON 二重永続化、部品ステータス変更は行わない）
  const handleSave = async () => {
    if (!record) return;
    setIsSaving(true);
    setStatusNotice(null);
    const payload: SelfInspectionRecord = {
      ...record,
      updatedAt: new Date().toISOString(),
      updatedByName: currentUser.name,
    };
    const res = await saveSelfInspectionRecord(payload);
    setIsSaving(false);
    if (res.success) {
      setRecord(res.record || payload);
      setIsSavedRecord(true);
      setStatusNotice({
        type: 'success',
        message: '自主検査書を保存しました（主要部品のステータスは変更されていません）。',
      });
    } else {
      setStatusNotice({
        type: 'error',
        message: `保存に失敗しました: ${res.error || '不明なエラー'}`,
      });
    }
  };

  const handleExportExcel = async () => {
    if (!record) return;
    setIsExportingExcel(true);
    try {
      await exportSelfInspectionToCrmExcel(record);
      setStatusNotice({
        type: 'success',
        message: `CRM連携用Excel（72列 A〜BT / ${record.doors.length}台分）を出力しました。`,
      });
    } catch (err: any) {
      setStatusNotice({
        type: 'error',
        message: `Excel出力エラー: ${err?.message || '出力に失敗しました'}`,
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  // 扉データ更新ヘルパー
  const updateDoor = (doorIdx: number, patch: Partial<SelfInspectionDoorRecord>) => {
    setRecord((prev) => {
      if (!prev) return prev;
      const nextDoors = prev.doors.map((d, i) => (i === doorIdx ? { ...d, ...patch } : d));
      return { ...prev, doors: nextDoors };
    });
  };

  const updateDoorCheck = (doorIdx: number, key: string, val: string) => {
    setRecord((prev) => {
      if (!prev) return prev;
      const nextDoors = prev.doors.map((d, i) => {
        if (i !== doorIdx) return d;
        const nextCheck = { ...d.checkResults, [key]: val };
        // 安全ステッカー確認とCRM列の自動同期
        const extraPatch: Partial<SelfInspectionDoorRecord> = {};
        if (key === 'stickers_applied') {
          if (val === '○' || val === 'レ') {
            if (!d.contactSticker) extraPatch.contactSticker = '有';
            if (!d.cautionSticker) extraPatch.cautionSticker = '有';
          }
        }
        return { ...d, ...extraPatch, checkResults: nextCheck };
      });
      return { ...prev, doors: nextDoors };
    });
  };

  // 外センサー ↔ 内センサー ワンタップ入替
  const handleSwapOuterInnerSensors = (doorIdx: number) => {
    if (!record) return;
    const d = record.doors[doorIdx];
    if (!d) return;
    updateDoor(doorIdx, {
      outerSensorMain: d.innerSensorMain,
      outerSensorMainLot: d.innerSensorMainLot,
      outerSensorSub: d.innerSensorSub,
      outerSensorSubLot: d.innerSensorSubLot,
      innerSensorMain: d.outerSensorMain,
      innerSensorMainLot: d.outerSensorMainLot,
      innerSensorSub: d.outerSensorSub,
      innerSensorSubLot: d.outerSensorSubLot,
    });
  };

  // 現在選択中の扉の判定項目を一括で初期「○」に設定
  const handleBatchOkForDoor = (doorIdx: number) => {
    if (!record) return;
    const d = record.doors[doorIdx];
    if (!d) return;
    const okCode = effectiveConfig.judgementOptions[0]?.code || '○';
    const nextCheck = { ...d.checkResults };
    for (const item of effectiveConfig.checkItems) {
      if (!item.isActive || item.inputType !== 'judgement') continue;
      // 該当無（－）がデフォルトの特殊項目で未設定の場合以外は okCode をセット
      if (!nextCheck[item.key] || nextCheck[item.key] === '') {
        nextCheck[item.key] = item.defaultVal || okCode;
      } else if (nextCheck[item.key] !== '－') {
        nextCheck[item.key] = okCode;
      }
    }
    updateDoor(doorIdx, { checkResults: nextCheck });
  };

  // 扉の追加・複製・削除
  const handleAddDoor = () => {
    if (!record) return;
    const nextIndex = record.doors.length + 1;
    const newDoor = createEmptySelfInspectionDoor(nextIndex, effectiveConfig, {
      constructionInputBy: record.inspectorName || currentUser.name,
      doorLedgerInputBy: currentUser.name,
    });
    setRecord((prev) => (prev ? { ...prev, doors: [...prev.doors, newDoor] } : prev));
    setSelectedDoorIdx(record.doors.length);
  };

  const handleDuplicateDoor = (doorIdx: number) => {
    if (!record) return;
    const src = record.doors[doorIdx];
    if (!src) return;
    const nextIndex = record.doors.length + 1;
    const clone: SelfInspectionDoorRecord = {
      ...src,
      id: `door-${Date.now()}-${nextIndex}`,
      doorIndex: nextIndex,
      fittingNo: src.fittingNo ? `${src.fittingNo}-2` : '',
      engineSerialNo: '',
      cbSerialNo: '',
      electricLockLot: '',
      electricLockCbLot: '',
      outerSensorMainLot: '',
      outerSensorSubLot: '',
      innerSensorMainLot: '',
      innerSensorSubLot: '',
      beamSensorLot: '',
      checkResults: { ...src.checkResults },
    };
    setRecord((prev) => (prev ? { ...prev, doors: [...prev.doors, clone] } : prev));
    setSelectedDoorIdx(record.doors.length);
  };

  const handleRemoveDoor = (doorIdx: number) => {
    if (!record || record.doors.length <= 1) return;
    const filtered = record.doors
      .filter((_, i) => i !== doorIdx)
      .map((d, idx) => ({ ...d, doorIndex: idx + 1 }));
    setRecord((prev) => (prev ? { ...prev, doors: filtered } : prev));
    setSelectedDoorIdx(Math.max(0, Math.min(doorIdx, filtered.length - 1)));
  };

  const orderedCategories = useMemo(
    () => [...effectiveConfig.categories].sort((a, b) => a.order - b.order),
    [effectiveConfig.categories]
  );

  if (isLoading || !record) {
    return (
      <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        <span>自主検査書を読み込んでいます...</span>
      </div>
    );
  }

  const currentDoor = record.doors[selectedDoorIdx] || record.doors[0];
  const sensorCandidates = (currentDoor?.inventoryCandidates || []).filter(
    (c) => c.partCategory === 'sensor' || c.partCategory === 'sub_sensor' || c.partCategory === 'beam'
  );

  const renderCheckInput = (item: SelfInspectionCheckItemDef, doorIdx: number, val: string) => {
    if (item.inputType === 'number') {
      return (
        <div className="flex items-center gap-1.5 justify-end">
          <input
            type="text"
            inputMode="decimal"
            value={val}
            onChange={(e) => updateDoorCheck(doorIdx, item.key, e.target.value)}
            placeholder={item.placeholder || '数値入力'}
            className="w-28 px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs text-right font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {item.unit && <span className="text-[11px] text-slate-500 font-medium">{item.unit}</span>}
        </div>
      );
    }

    if (item.inputType === 'text') {
      return (
        <input
          type="text"
          value={val}
          onChange={(e) => updateDoorCheck(doorIdx, item.key, e.target.value)}
          placeholder={item.placeholder || '入力...'}
          className="w-44 px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      );
    }

    if (item.inputType === 'select') {
      return (
        <select
          value={val}
          onChange={(e) => updateDoorCheck(doorIdx, item.key, e.target.value)}
          className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">選択...</option>
          {(item.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    // judgement（判定記号ボタン群）
    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        {effectiveConfig.judgementOptions.map((opt) => {
          const isSelected = val === opt.code;
          const activeClass =
            opt.tone === 'emerald'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : opt.tone === 'rose'
                ? 'bg-rose-600 text-white border-rose-600'
                : opt.tone === 'amber'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : opt.tone === 'indigo'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-600 text-white border-slate-600';
          return (
            <button
              key={opt.code}
              type="button"
              onClick={() => updateDoorCheck(doorIdx, item.key, isSelected ? '' : opt.code)}
              title={opt.label}
              className={`min-w-[32px] h-7 px-2 rounded-md border text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                isSelected
                  ? activeClass
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {opt.code}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 上部アクションバー */}
      <div className="p-3.5 bg-white border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-sm text-slate-900 whitespace-nowrap">自動ドア自主検査書</h4>
            <span className="text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
              全 {record.doors.length} 台
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
            <span>{isSavedRecord ? `保存済 (${record.updatedByName || record.inspectorName})` : '未保存（現場・在庫から初期生成）'}</span>
            <span aria-hidden="true">·</span>
            <span>適用様式: {effectiveConfig.officeName || '全社共通'}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSyncFromInventory}
            disabled={isSyncingInventory}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            title="在庫データベースから最新の部品明細を取得し、空欄や候補へ自動反映します"
          >
            {isSyncingInventory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5 text-indigo-600" />}
            <span>在庫DBから自動反映</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>保存</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPrintPreview(true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>自主検査書 印刷 / PDF</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isExportingExcel}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            title="A〜BT列（72列）のCRM取込用Excelファイルを出力します"
          >
            {isExportingExcel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
            <span>CRM連携 Excel出力</span>
          </button>
        </div>
      </div>

      {/* 通知バナー */}
      {statusNotice && (
        <div
          className={`px-3.5 py-2.5 rounded-lg border text-xs font-medium flex items-center justify-between gap-2 ${
            statusNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : statusNotice.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-[11px] font-bold underline cursor-pointer shrink-0"
          >
            閉じる
          </button>
        </div>
      )}

      {/* 自主検査書 基本ヘッダー */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">検査日</label>
            <input
              type="date"
              value={record.inspectionDate}
              onChange={(e) => setRecord({ ...record, inspectionDate: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">担当（検査者）</label>
            <input
              type="text"
              value={record.inspectorName}
              onChange={(e) => setRecord({ ...record, inspectorName: e.target.value })}
              placeholder="検査担当者名"
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">図面番号</label>
            <input
              type="text"
              value={record.drawingNo}
              onChange={(e) => setRecord({ ...record, drawingNo: e.target.value })}
              placeholder="例: DRW-2026-001"
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">適用拠点様式</label>
            <select
              value={record.officeId || 'default'}
              onChange={(e) => {
                const off = offices.find((o) => String(o.id) === e.target.value);
                setRecord({
                  ...record,
                  officeId: e.target.value,
                  officeName: off?.name || '全社共通',
                });
              }}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900"
            >
              <option value="default">全社共通（デフォルト）</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* CRM連携用 現場・取引先ヘッダー（折りたたみ） */}
        <div className="pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setShowCrmHeader((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-indigo-700 transition-colors cursor-pointer"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                showCrmHeader ? 'rotate-0' : '-rotate-90'
              }`}
            />
            <span>CRM連携用 現場・取引先情報（管理番号・契約先・設計事務所・サッシ業者・施主・建物用途）</span>
          </button>

          {showCrmHeader && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-2 border-t border-slate-100">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">管理番号 (A列)</label>
                <input
                  type="text"
                  value={record.managementNo}
                  onChange={(e) => setRecord({ ...record, managementNo: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">契約先 (B列)</label>
                <input
                  type="text"
                  value={record.contractClient}
                  onChange={(e) => setRecord({ ...record, contractClient: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">工事名称 (C列)</label>
                <input
                  type="text"
                  value={record.constructionName}
                  onChange={(e) => setRecord({ ...record, constructionName: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">建物用途 (BT列)</label>
                <MasterComboInput
                  listId="dl-building-use"
                  options={BUILDING_USE_MASTERS}
                  value={record.buildingUse}
                  onChange={(val) => setRecord({ ...record, buildingUse: val })}
                  placeholder="例: 商業施設, 事務所"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">建物名称 (D列)</label>
                <input
                  type="text"
                  value={record.buildingName}
                  onChange={(e) => setRecord({ ...record, buildingName: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">建物名称カナ（半角） (E列)</label>
                <input
                  type="text"
                  value={record.buildingNameKana}
                  onChange={(e) => setRecord({ ...record, buildingNameKana: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">郵便番号 (F列)</label>
                <input
                  type="text"
                  value={record.postalCode}
                  onChange={(e) => setRecord({ ...record, postalCode: e.target.value })}
                  placeholder="例: 460-0000"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">入力者 (Q列)</label>
                <input
                  type="text"
                  value={record.siteInputBy}
                  onChange={(e) => setRecord({ ...record, siteInputBy: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">建物住所 (G列)</label>
                <input
                  type="text"
                  value={record.buildingAddress}
                  onChange={(e) => setRecord({ ...record, buildingAddress: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">建設会社 (H列)</label>
                <input
                  type="text"
                  value={record.constructionCompany}
                  onChange={(e) => setRecord({ ...record, constructionCompany: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">建設会社 連絡先 (I列)</label>
                <input
                  type="text"
                  value={record.constructionCompanyContact}
                  onChange={(e) => setRecord({ ...record, constructionCompanyContact: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">設計事務所 (J列)</label>
                <input
                  type="text"
                  value={record.designOffice}
                  onChange={(e) => setRecord({ ...record, designOffice: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">設計事務所 連絡先 (K列)</label>
                <input
                  type="text"
                  value={record.designOfficeContact}
                  onChange={(e) => setRecord({ ...record, designOfficeContact: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">サッシ業者 (L列)</label>
                <input
                  type="text"
                  value={record.sashVendor}
                  onChange={(e) => setRecord({ ...record, sashVendor: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">サッシ業者 連絡先 (M列)</label>
                <input
                  type="text"
                  value={record.sashVendorContact}
                  onChange={(e) => setRecord({ ...record, sashVendorContact: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">施主 (N列)</label>
                <input
                  type="text"
                  value={record.ownerName}
                  onChange={(e) => setRecord({ ...record, ownerName: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">施主 連絡先 (O列)</label>
                <input
                  type="text"
                  value={record.ownerContact}
                  onChange={(e) => setRecord({ ...record, ownerContact: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">現場備考 (P列)</label>
                <input
                  type="text"
                  value={record.siteRemarks}
                  onChange={(e) => setRecord({ ...record, siteRemarks: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 扉（台数）切替タブバー */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {record.doors.map((d, idx) => {
            const isSelected = idx === selectedDoorIdx;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDoorIdx(idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap font-mono tabular-nums ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                }`}
              >
                NO.{d.doorIndex} {d.fittingNo ? `(${d.fittingNo})` : ''}
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleAddDoor}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-indigo-700 bg-white border border-dashed border-indigo-300 hover:bg-indigo-50 flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>扉を追加</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => handleDuplicateDoor(selectedDoorIdx)}
            className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-indigo-700 hover:bg-white border border-transparent hover:border-slate-200 rounded-md flex items-center gap-1 cursor-pointer whitespace-nowrap"
            title="現在の扉の仕様を複製して新しい扉を追加（シリアルNo.は空欄になります）"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>この扉を複製</span>
          </button>
          {record.doors.length > 1 && (
            <button
              type="button"
              onClick={() => handleRemoveDoor(selectedDoorIdx)}
              className="px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 rounded-md flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>削除</span>
            </button>
          )}
        </div>
      </div>

      {/* 選択中の扉 入力エリア */}
      {currentDoor && (
        <div className="space-y-4">
          {/* 1. 扉諸元・動作・電源スイッチ */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h5 className="font-bold text-xs text-slate-900">
                1. 扉諸元・電源スイッチ・動作設定（NO.{currentDoor.doorIndex}）
              </h5>
              <span className="text-[11px] text-slate-400">自主検査書＋CRM両方に連動</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">階数</label>
                <input
                  type="text"
                  value={currentDoor.floor}
                  onChange={(e) => updateDoor(selectedDoorIdx, { floor: e.target.value })}
                  placeholder="例: 1F, B1F"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">建具番号（符号）</label>
                <input
                  type="text"
                  value={currentDoor.fittingNo}
                  onChange={(e) => updateDoor(selectedDoorIdx, { fittingNo: e.target.value })}
                  placeholder="例: AW7, AD1"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">エンジン機種（モーター）</label>
                <MasterComboInput
                  listId="dl-motor-master"
                  options={MOTOR_MASTERS}
                  value={currentDoor.engineModel}
                  onChange={(val) => updateDoor(selectedDoorIdx, { engineModel: val })}
                  placeholder="例: 160KLCM"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">エンジン シリアルNo.</label>
                <input
                  type="text"
                  value={currentDoor.engineSerialNo}
                  onChange={(e) => updateDoor(selectedDoorIdx, { engineSerialNo: e.target.value })}
                  placeholder="現場で銘板No.を入力"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">ドア種類</label>
                <select
                  value={currentDoor.doorType}
                  onChange={(e) => updateDoor(selectedDoorIdx, { doorType: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                >
                  <option value="">選択してください</option>
                  {DOOR_TYPE_MASTERS.map((dt) => (
                    <option key={dt.code} value={dt.label}>
                      {dt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">開閉方式</label>
                <MasterComboInput
                  listId="dl-opening-method"
                  options={OPENING_METHOD_MASTERS}
                  value={currentDoor.openingMethod}
                  onChange={(val) => updateDoor(selectedDoorIdx, { openingMethod: val })}
                  placeholder="例: 両引, 片引"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">取付方法（EG納まり）</label>
                <MasterComboInput
                  listId="dl-mount-method"
                  options={EG_MOUNT_MASTERS}
                  value={currentDoor.mountMethod}
                  onChange={(val) => updateDoor(selectedDoorIdx, { mountMethod: val })}
                  placeholder="例: 無目, 天井, 直付"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">電源スイッチ位置</label>
                <div className="grid grid-cols-3 gap-1">
                  {POWER_SWITCH_MASTERS.map((ps) => {
                    const active = currentDoor.powerSwitchPos === ps.crmVal;
                    return (
                      <button
                        key={ps.code}
                        type="button"
                        onClick={() => updateDoor(selectedDoorIdx, { powerSwitchPos: active ? '' : ps.crmVal })}
                        className={`py-1.5 px-1 rounded-md border text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {ps.crmVal}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">有効開口 (mm)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={currentDoor.effectiveOpeningMm}
                  onChange={(e) => updateDoor(selectedDoorIdx, { effectiveOpeningMm: e.target.value })}
                  placeholder="例: 1200"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">開速度 (9〜1 / mm/sec)</label>
                <input
                  type="text"
                  value={currentDoor.openSpeed}
                  onChange={(e) => updateDoor(selectedDoorIdx, { openSpeed: e.target.value })}
                  placeholder="例: 7 または 450"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">閉速度 (9〜1 / mm/sec)</label>
                <input
                  type="text"
                  value={currentDoor.closeSpeed}
                  onChange={(e) => updateDoor(selectedDoorIdx, { closeSpeed: e.target.value })}
                  placeholder="例: 4 または 250"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">開き保持時間 (秒)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={currentDoor.holdOpenTimeSec}
                  onChange={(e) => updateDoor(selectedDoorIdx, { holdOpenTimeSec: e.target.value })}
                  placeholder="例: 1.5"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* 2. 起動センサー・補助光線（在庫候補からのワンタップ割当・外↔内入替対応） */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <h5 className="font-bold text-xs text-slate-900">
                  2. 起動センサー・補助センサー・その他スイッチ（EGボックスより観て）
                </h5>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  在庫DBから抽出したセンサーは暫定配置されます。外・内が逆の場合はワンタップで入れ替えできます。
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSwapOuterInnerSensors(selectedDoorIdx)}
                className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>外側 ↔ 内側 を入替</span>
              </button>
            </div>

            {/* この建具に紐づく在庫センサー候補のクイック割当パネル */}
            {sensorCandidates.length > 0 && (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-600">
                  在庫明細から検出されたセンサー候補（ボタンで各枠へワンタップ割当）:
                </div>
                <div className="space-y-1">
                  {sensorCandidates.map((cand, cIdx) => {
                    const modelName = cand.matchedMaster || cand.partName;
                    return (
                      <div
                        key={`cand-${cIdx}`}
                        className="flex flex-wrap items-center justify-between gap-2 py-1 border-b border-slate-200/70 last:border-b-0 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-bold text-slate-900">{modelName}</span>
                          {cand.partName !== modelName && (
                            <span className="text-[11px] text-slate-500 ml-1.5">({cand.partName})</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateDoor(selectedDoorIdx, { outerSensorMain: modelName })}
                            className="px-2 py-0.5 text-[11px] font-semibold bg-white border border-slate-300 hover:border-indigo-400 hover:text-indigo-700 rounded cursor-pointer"
                          >
                            外起動
                          </button>
                          <button
                            type="button"
                            onClick={() => updateDoor(selectedDoorIdx, { outerSensorSub: modelName })}
                            className="px-2 py-0.5 text-[11px] font-semibold bg-white border border-slate-300 hover:border-indigo-400 hover:text-indigo-700 rounded cursor-pointer"
                          >
                            外補助
                          </button>
                          <button
                            type="button"
                            onClick={() => updateDoor(selectedDoorIdx, { innerSensorMain: modelName })}
                            className="px-2 py-0.5 text-[11px] font-semibold bg-white border border-slate-300 hover:border-indigo-400 hover:text-indigo-700 rounded cursor-pointer"
                          >
                            内起動
                          </button>
                          <button
                            type="button"
                            onClick={() => updateDoor(selectedDoorIdx, { innerSensorSub: modelName })}
                            className="px-2 py-0.5 text-[11px] font-semibold bg-white border border-slate-300 hover:border-indigo-400 hover:text-indigo-700 rounded cursor-pointer"
                          >
                            内補助
                          </button>
                          <button
                            type="button"
                            onClick={() => updateDoor(selectedDoorIdx, { beamSensor: modelName })}
                            className="px-2 py-0.5 text-[11px] font-semibold bg-white border border-slate-300 hover:border-indigo-400 hover:text-indigo-700 rounded cursor-pointer"
                          >
                            補助光線
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">外側：起動センサー型式</label>
                <MasterComboInput
                  listId="dl-sensor-master"
                  options={SENSOR_MASTERS}
                  value={currentDoor.outerSensorMain}
                  onChange={(val) => updateDoor(selectedDoorIdx, { outerSensorMain: val })}
                  placeholder="例: OA-215V"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">外側：補助センサー型式</label>
                <MasterComboInput
                  listId="dl-sub-sensor-master"
                  options={SUB_SENSOR_MASTERS}
                  value={currentDoor.outerSensorSub}
                  onChange={(val) => updateDoor(selectedDoorIdx, { outerSensorSub: val })}
                  placeholder="例: OS-10P"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">補助光線（安全光線）型式</label>
                <MasterComboInput
                  listId="dl-beam-master"
                  options={SUB_SENSOR_MASTERS}
                  value={currentDoor.beamSensor}
                  onChange={(val) => updateDoor(selectedDoorIdx, { beamSensor: val })}
                  placeholder="例: OS-10P"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">内側：起動センサー型式</label>
                <MasterComboInput
                  listId="dl-sensor-inner"
                  options={SENSOR_MASTERS}
                  value={currentDoor.innerSensorMain}
                  onChange={(val) => updateDoor(selectedDoorIdx, { innerSensorMain: val })}
                  placeholder="例: HA-T520"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">内側：補助センサー型式</label>
                <MasterComboInput
                  listId="dl-sub-sensor-inner"
                  options={SUB_SENSOR_MASTERS}
                  value={currentDoor.innerSensorSub}
                  onChange={(val) => updateDoor(selectedDoorIdx, { innerSensorSub: val })}
                  placeholder="例: OS-10P"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">その他起動スイッチ / 電気錠 / 火報信号</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="text"
                    value={currentDoor.otherSwitch}
                    onChange={(e) => updateDoor(selectedDoorIdx, { otherSwitch: e.target.value })}
                    placeholder="その他SW"
                    className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                  <select
                    value={currentDoor.fireAlarmSignal}
                    onChange={(e) => updateDoor(selectedDoorIdx, { fireAlarmSignal: e.target.value })}
                    className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    title="火報信号 (1.オープン / 2.クローズ)"
                  >
                    {FIRE_ALARM_SIGNAL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        火報: {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* 3. 自主検査チェック項目（拠点様式連動） */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h5 className="font-bold text-xs text-slate-900">
                  3. 自主検査チェック項目（NO.{currentDoor.doorIndex}）
                </h5>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  管理画面の「自主検査書様式（拠点別）」で項目追加・数値欄追加・判定記号のカスタマイズが可能です。
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleBatchOkForDoor(selectedDoorIdx)}
                className="px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>判定項目を一括「{effectiveConfig.judgementOptions[0]?.code || '○'}」</span>
              </button>
            </div>

            <div className="divide-y divide-slate-200">
              {orderedCategories.map((cat) => {
                const items = effectiveConfig.checkItems
                  .filter((i) => i.isActive && i.category === cat.id)
                  .sort((a, b) => a.order - b.order);
                if (items.length === 0) return null;

                return (
                  <div key={cat.id} className="p-3.5 space-y-2">
                    <div className="text-xs font-bold text-slate-800">{cat.name}</div>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                      {items.map((item) => (
                        <div
                          key={item.key}
                          className="px-3 py-2 bg-white hover:bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="text-xs text-slate-800 min-w-0">
                            <span>{item.label}</span>
                            {item.inputType === 'number' && item.unit && (
                              <span className="text-[11px] text-slate-400 ml-1">({item.unit})</span>
                            )}
                          </div>
                          <div className="shrink-0">
                            {renderCheckInput(item, selectedDoorIdx, currentDoor.checkResults?.[item.key] ?? '')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. CRM台帳 詳細補完（折りたたみ） */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCrmDoorDetails((v) => !v)}
              className="w-full px-4 py-3 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform duration-150 shrink-0 ${
                    showCrmDoorDetails ? 'rotate-0' : '-rotate-90'
                  }`}
                />
                <span className="font-bold text-xs text-slate-800">
                  4. CRM連携用 扉詳細・部材・ロット番号（NO.{currentDoor.doorIndex} / 任意補完）
                </span>
              </div>
              <span className="text-[11px] text-slate-500 whitespace-nowrap">
                {showCrmDoorDetails ? '折りたたむ' : '展開して編集'}
              </span>
            </button>

            {showCrmDoorDetails && (
              <div className="p-4 space-y-4 border-t border-slate-200 text-xs">
                {/* 建具仕様 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">設置場所 (T列)</label>
                    <input
                      type="text"
                      value={currentDoor.location}
                      onChange={(e) => updateDoor(selectedDoorIdx, { location: e.target.value })}
                      placeholder="例: 正面玄関"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">設置場所カナ（半角） (U列)</label>
                    <input
                      type="text"
                      value={currentDoor.locationKana}
                      onChange={(e) => updateDoor(selectedDoorIdx, { locationKana: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">建具材質 (V列)</label>
                    <MasterComboInput
                      listId="dl-material"
                      options={MATERIAL_MASTERS}
                      value={currentDoor.doorMaterial}
                      onChange={(val) => updateDoor(selectedDoorIdx, { doorMaterial: val })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">メーカー (W列)</label>
                    <input
                      type="text"
                      value={currentDoor.manufacturer}
                      onChange={(e) => updateDoor(selectedDoorIdx, { manufacturer: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">台板寸法 (Z列)</label>
                    <input
                      type="text"
                      value={currentDoor.baseplateDimension}
                      onChange={(e) => updateDoor(selectedDoorIdx, { baseplateDimension: e.target.value })}
                      placeholder="例: 4950"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">コーナーブラケット (AA列)</label>
                    <input
                      type="text"
                      value={currentDoor.cornerBracket}
                      onChange={(e) => updateDoor(selectedDoorIdx, { cornerBracket: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">扉重量 (AB列)</label>
                    <input
                      type="text"
                      value={currentDoor.doorWeight}
                      onChange={(e) => updateDoor(selectedDoorIdx, { doorWeight: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">HP寸法 (AE列)</label>
                    <input
                      type="text"
                      value={currentDoor.hpDimension}
                      onChange={(e) => updateDoor(selectedDoorIdx, { hpDimension: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">扉サイズH (AC列)</label>
                    <input
                      type="text"
                      value={currentDoor.doorSizeH}
                      onChange={(e) => updateDoor(selectedDoorIdx, { doorSizeH: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">扉サイズW (AD列)</label>
                    <input
                      type="text"
                      value={currentDoor.doorSizeW}
                      onChange={(e) => updateDoor(selectedDoorIdx, { doorSizeW: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">ガラス (AF列)</label>
                    <MasterComboInput
                      listId="dl-glass"
                      options={GLASS_MASTERS}
                      value={currentDoor.glassType}
                      onChange={(val) => updateDoor(selectedDoorIdx, { glassType: val })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">防火区画 (AH列)</label>
                    <MasterComboInput
                      listId="dl-fire-comp"
                      options={YES_NO_MASTERS}
                      value={currentDoor.fireCompartment}
                      onChange={(val) => updateDoor(selectedDoorIdx, { fireCompartment: val })}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">防火設備 (AI列)</label>
                    <MasterComboInput
                      listId="dl-fire-equip"
                      options={FIRE_EQUIPMENT_MASTERS}
                      value={currentDoor.fireProtectionEquipment}
                      onChange={(val) => updateDoor(selectedDoorIdx, { fireProtectionEquipment: val })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">非常電源 (AJ列)</label>
                    <MasterComboInput
                      listId="dl-emerg-pwr"
                      options={YES_NO_MASTERS}
                      value={currentDoor.emergencyPower}
                      onChange={(val) => updateDoor(selectedDoorIdx, { emergencyPower: val })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">壁SW (AO列)</label>
                    <input
                      type="text"
                      value={currentDoor.wallSwitch}
                      onChange={(e) => updateDoor(selectedDoorIdx, { wallSwitch: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">防護柵 (AR列)</label>
                    <MasterComboInput
                      listId="dl-fence"
                      options={YES_NO_MASTERS}
                      value={currentDoor.protectiveFence}
                      onChange={(val) => updateDoor(selectedDoorIdx, { protectiveFence: val })}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">連絡先ステッカー (AP列)</label>
                    <MasterComboInput
                      listId="dl-contact-st"
                      options={STICKER_MASTERS}
                      value={currentDoor.contactSticker}
                      onChange={(val) => updateDoor(selectedDoorIdx, { contactSticker: val })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">注意ステッカー (AQ列)</label>
                    <MasterComboInput
                      listId="dl-caution-st"
                      options={STICKER_MASTERS}
                      value={currentDoor.cautionSticker}
                      onChange={(val) => updateDoor(selectedDoorIdx, { cautionSticker: val })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">モーター取付日 (AU列)</label>
                    <input
                      type="date"
                      value={currentDoor.engineInstallDate}
                      onChange={(e) => updateDoor(selectedDoorIdx, { engineInstallDate: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">CB（改造） (AV列)</label>
                    <MasterComboInput
                      listId="dl-cb-master"
                      options={CB_MASTERS}
                      value={currentDoor.cbModel}
                      onChange={(val) => updateDoor(selectedDoorIdx, { cbModel: val })}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">CB製造№ (AX列)</label>
                    <input
                      type="text"
                      value={currentDoor.cbSerialNo}
                      onChange={(e) => updateDoor(selectedDoorIdx, { cbSerialNo: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">CB取付日 (AY列)</label>
                    <input
                      type="date"
                      value={currentDoor.cbInstallDate}
                      onChange={(e) => updateDoor(selectedDoorIdx, { cbInstallDate: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">電気錠 本体 (AZ列)</label>
                    <MasterComboInput
                      listId="dl-elock"
                      options={ELECTRIC_LOCK_MASTERS}
                      value={currentDoor.electricLockModel}
                      onChange={(val) => updateDoor(selectedDoorIdx, { electricLockModel: val })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">電気錠 ロット番号 (BA列)</label>
                    <input
                      type="text"
                      value={currentDoor.electricLockLot}
                      onChange={(e) => updateDoor(selectedDoorIdx, { electricLockLot: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">電気錠 CB (BB列)</label>
                    <input
                      type="text"
                      value={currentDoor.electricLockCbModel}
                      onChange={(e) => updateDoor(selectedDoorIdx, { electricLockCbModel: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">電気錠 CB ロット番号 (BC列)</label>
                    <input
                      type="text"
                      value={currentDoor.electricLockCbLot}
                      onChange={(e) => updateDoor(selectedDoorIdx, { electricLockCbLot: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">外起動 ロット番号 (BE列)</label>
                    <input
                      type="text"
                      value={currentDoor.outerSensorMainLot}
                      onChange={(e) => updateDoor(selectedDoorIdx, { outerSensorMainLot: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">外補助 ロット番号 (BG列)</label>
                    <input
                      type="text"
                      value={currentDoor.outerSensorSubLot}
                      onChange={(e) => updateDoor(selectedDoorIdx, { outerSensorSubLot: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">内起動 ロット番号 (BI列)</label>
                    <input
                      type="text"
                      value={currentDoor.innerSensorMainLot}
                      onChange={(e) => updateDoor(selectedDoorIdx, { innerSensorMainLot: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">内補助 ロット番号 (BK列)</label>
                    <input
                      type="text"
                      value={currentDoor.innerSensorSubLot}
                      onChange={(e) => updateDoor(selectedDoorIdx, { innerSensorSubLot: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">補助光線 ロット番号 (BM列)</label>
                    <input
                      type="text"
                      value={currentDoor.beamSensorLot}
                      onChange={(e) => updateDoor(selectedDoorIdx, { beamSensorLot: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">戸車 (BN列)</label>
                    <MasterComboInput
                      listId="dl-roller"
                      options={ROLLER_MASTERS}
                      value={currentDoor.roller}
                      onChange={(val) => updateDoor(selectedDoorIdx, { roller: val })}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">ベルト (BO列)</label>
                    <MasterComboInput
                      listId="dl-belt"
                      options={BELT_MASTERS}
                      value={currentDoor.belt}
                      onChange={(val) => updateDoor(selectedDoorIdx, { belt: val })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">台板 (BQ列)</label>
                    <MasterComboInput
                      listId="dl-baseplate"
                      options={BASEPLATE_MASTERS}
                      value={currentDoor.baseplate}
                      onChange={(val) => updateDoor(selectedDoorIdx, { baseplate: val })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">ドア台帳入力者 (AM列)</label>
                    <input
                      type="text"
                      value={currentDoor.doorLedgerInputBy}
                      onChange={(e) => updateDoor(selectedDoorIdx, { doorLedgerInputBy: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">工事入力者 (BS列)</label>
                    <input
                      type="text"
                      value={currentDoor.constructionInputBy}
                      onChange={(e) => updateDoor(selectedDoorIdx, { constructionInputBy: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">仕様備考 (AL列)</label>
                    <input
                      type="text"
                      value={currentDoor.specRemarks}
                      onChange={(e) => updateDoor(selectedDoorIdx, { specRemarks: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">部材備考 (BR列)</label>
                    <input
                      type="text"
                      value={currentDoor.partsRemarks}
                      onChange={(e) => updateDoor(selectedDoorIdx, { partsRemarks: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. 連絡事項（自主検査書下部） */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <label className="block font-bold text-xs text-slate-900">
              5. 連絡事項（自主検査書 下部記入欄）
            </label>
            <textarea
              rows={3}
              value={record.contactNotes}
              onChange={(e) => setRecord({ ...record, contactNotes: e.target.value })}
              placeholder="現場特有の注意点、引き継ぎ事項、調整メモなどを記入..."
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      )}

      {/* A4印刷プレビューモーダル */}
      <SelfInspectionPrintPreview
        isOpen={showPrintPreview}
        onClose={() => setShowPrintPreview(false)}
        record={record}
        config={effectiveConfig}
        onExportExcel={handleExportExcel}
      />
    </div>
  );
};
