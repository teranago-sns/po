import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Sliders,
  Trash2,
  Wand2,
  AlertCircle,
} from 'lucide-react';
import { OfficeMaster, User } from '../../types';
import {
  AutoMatchTargetField,
  InventoryAutoMatchRule,
  SelfInspectionCheckItemDef,
  SelfInspectionInputType,
  SelfInspectionJudgementOption,
  SelfInspectionOfficeConfig,
} from '../../types/selfInspection';
import { createDefaultSelfInspectionOfficeConfig } from '../../constants/selfInspectionMasters';
import {
  fetchSelfInspectionOfficeConfigs,
  saveSelfInspectionOfficeConfig,
} from '../../utils/selfInspectionUtils';

interface SelfInspectionConfigPanelProps {
  offices: OfficeMaster[];
  currentUser: User;
}

const TARGET_FIELD_LABELS: Record<AutoMatchTargetField, string> = {
  checkItem: '自主検査チェック項目に値をセット',
  openingMethod: '開閉方式',
  mountMethod: '取付方法（EG納まり）',
  doorType: 'ドア種類',
  emergencyPower: '非常電源（有/無）',
  fireAlarmSignal: '火報信号',
  fireProtectionEquipment: '防火設備',
  fireCompartment: '防火区画',
  electricLock: '電気錠 本体',
  beamSensor: '補助光線',
  powerSwitchPos: '電源スイッチ位置',
  wallSwitch: '壁SW',
};

export const SelfInspectionConfigPanel: React.FC<SelfInspectionConfigPanelProps> = ({
  offices,
  currentUser,
}) => {
  const [configs, setConfigs] = useState<SelfInspectionOfficeConfig[]>([
    createDefaultSelfInspectionOfficeConfig(),
  ]);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('default');
  const [innerTab, setInnerTab] = useState<'items' | 'judgements' | 'rules'>('items');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 新規カテゴリ・項目追加用
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newItemLabel, setNewItemLabel] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('power');
  const [newItemType, setNewItemType] = useState<SelfInspectionInputType>('judgement');
  const [newItemUnit, setNewItemUnit] = useState('');
  const [newItemDefault, setNewItemDefault] = useState('○');

  // 新規判定記号用
  const [newJudgeCode, setNewJudgeCode] = useState('');
  const [newJudgeLabel, setNewJudgeLabel] = useState('');
  const [newJudgeTone, setNewJudgeTone] = useState<SelfInspectionJudgementOption['tone']>('slate');

  // 新規自動適合ルール用
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleKeywords, setNewRuleKeywords] = useState('');
  const [newRuleMatchMode, setNewRuleMatchMode] = useState<'any' | 'all'>('any');
  const [newRuleField, setNewRuleField] = useState<AutoMatchTargetField>('checkItem');
  const [newRuleCheckKey, setNewRuleCheckKey] = useState('emergency_power_check');
  const [newRuleValue, setNewRuleValue] = useState('○');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      const list = await fetchSelfInspectionOfficeConfigs();
      if (!active) return;
      setConfigs(list);
      setIsLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const currentConfig = useMemo<SelfInspectionOfficeConfig>(() => {
    const existing = configs.find((c) => String(c.officeId) === String(selectedOfficeId));
    if (existing) return existing;
    const defaultBase =
      configs.find((c) => c.officeId === 'default') ||
      createDefaultSelfInspectionOfficeConfig();
    const office = offices.find((o) => String(o.id) === String(selectedOfficeId));
    return {
      ...defaultBase,
      officeId: selectedOfficeId,
      officeCode: office?.code,
      officeName: office?.name || '全社共通（デフォルト）',
      useCustomConfig: selectedOfficeId === 'default',
      categories: defaultBase.categories.map((c) => ({ ...c })),
      checkItems: defaultBase.checkItems.map((i) => ({ ...i })),
      judgementOptions: defaultBase.judgementOptions.map((j) => ({ ...j })),
      autoMatchRules: defaultBase.autoMatchRules.map((r) => ({ ...r, keywords: [...r.keywords] })),
    };
  }, [configs, selectedOfficeId, offices]);

  const updateCurrentConfig = (updater: (prev: SelfInspectionOfficeConfig) => SelfInspectionOfficeConfig) => {
    setConfigs((prevList) => {
      const updated = updater(currentConfig);
      const idx = prevList.findIndex((c) => String(c.officeId) === String(selectedOfficeId));
      if (idx >= 0) {
        const next = [...prevList];
        next[idx] = updated;
        return next;
      }
      return [...prevList, updated];
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setNotice(null);
    const office = offices.find((o) => String(o.id) === String(selectedOfficeId));
    const payload: SelfInspectionOfficeConfig = {
      ...currentConfig,
      officeId: selectedOfficeId,
      officeCode: office?.code || (selectedOfficeId === 'default' ? 'DEFAULT' : ''),
      officeName: office?.name || '全社共通（デフォルト）',
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.name,
    };
    const res = await saveSelfInspectionOfficeConfig(selectedOfficeId, payload);
    setIsSaving(false);
    if (res.success) {
      updateCurrentConfig(() => res.config || payload);
      setNotice({
        type: 'success',
        message: `「${payload.officeName}」の自主検査書様式・自動適合ルールを保存しました。`,
      });
    } else {
      setNotice({
        type: 'error',
        message: `保存に失敗しました: ${res.error || '通信エラー'}`,
      });
    }
  };

  const handleResetToDefault = () => {
    const office = offices.find((o) => String(o.id) === String(selectedOfficeId));
    const fresh = createDefaultSelfInspectionOfficeConfig(
      selectedOfficeId,
      office?.name || '全社共通（デフォルト）',
      office?.code
    );
    fresh.useCustomConfig = selectedOfficeId === 'default' ? true : currentConfig.useCustomConfig;
    updateCurrentConfig(() => fresh);
    setNotice({
      type: 'success',
      message: '標準様式に戻しました。「設定を保存」を押すと反映されます。',
    });
  };

  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const id = `custom_cat_${Date.now()}`;
    updateCurrentConfig((prev) => ({
      ...prev,
      categories: [
        ...prev.categories,
        { id, name, order: prev.categories.length + 1 },
      ],
    }));
    setNewItemCategory(id);
    setNewCategoryName('');
  };

  const handleAddItem = () => {
    const label = newItemLabel.trim();
    if (!label) return;
    const key = `custom_item_${Date.now()}`;
    const catItems = currentConfig.checkItems.filter((i) => i.category === newItemCategory);
    const newItem: SelfInspectionCheckItemDef = {
      key,
      label,
      category: newItemCategory,
      inputType: newItemType,
      unit: newItemType === 'number' ? newItemUnit.trim() || undefined : undefined,
      defaultVal: newItemDefault.trim(),
      order: catItems.length + 1,
      isActive: true,
      showInPrint: true,
    };
    updateCurrentConfig((prev) => ({
      ...prev,
      checkItems: [...prev.checkItems, newItem],
    }));
    setNewItemLabel('');
    setNewItemUnit('');
  };

  const handleMoveItem = (itemKey: string, direction: -1 | 1) => {
    const target = currentConfig.checkItems.find((i) => i.key === itemKey);
    if (!target) return;
    const siblings = currentConfig.checkItems
      .filter((i) => i.category === target.category)
      .sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((i) => i.key === itemKey);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;

    const swapped = [...siblings];
    [swapped[idx], swapped[swapIdx]] = [swapped[swapIdx], swapped[idx]];
    const orderMap = new Map(swapped.map((item, i) => [item.key, i + 1]));

    updateCurrentConfig((prev) => ({
      ...prev,
      checkItems: prev.checkItems.map((i) =>
        orderMap.has(i.key) ? { ...i, order: orderMap.get(i.key)! } : i
      ),
    }));
  };

  const handleAddJudgement = () => {
    const code = newJudgeCode.trim();
    if (!code) return;
    if (currentConfig.judgementOptions.some((j) => j.code === code)) return;
    updateCurrentConfig((prev) => ({
      ...prev,
      judgementOptions: [
        ...prev.judgementOptions,
        { code, label: newJudgeLabel.trim() || code, tone: newJudgeTone },
      ],
    }));
    setNewJudgeCode('');
    setNewJudgeLabel('');
  };

  const handleAddRule = () => {
    const name = newRuleName.trim();
    const keywords = newRuleKeywords
      .split(/[,、\s]+/)
      .map((k) => k.trim())
      .filter(Boolean);
    if (!name || keywords.length === 0 || !newRuleValue.trim()) return;

    const newRule: InventoryAutoMatchRule = {
      id: `rule-${Date.now()}`,
      name,
      keywords,
      matchMode: newRuleMatchMode,
      targetField: newRuleField,
      targetCheckKey: newRuleField === 'checkItem' ? newRuleCheckKey : undefined,
      targetValue: newRuleValue.trim(),
      enabled: true,
    };

    updateCurrentConfig((prev) => ({
      ...prev,
      autoMatchRules: [...prev.autoMatchRules, newRule],
    }));
    setNewRuleName('');
    setNewRuleKeywords('');
  };

  const orderedCategories = [...currentConfig.categories].sort((a, b) => a.order - b.order);

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
        <span>自主検査書様式設定を読み込み中...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-indigo-600" />
            自主検査書様式（拠点別）・自動適合ルール設定
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            自動ドア自主検査書のチェック項目（判定記号・数値欄・自由入力）・判定選択肢・在庫DB自動適合ルールを拠点ごとにカスタマイズします。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>標準様式に戻す</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>設定を保存</span>
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`px-3.5 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {notice.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{notice.message}</span>
        </div>
      )}

      {/* 拠点選択バー */}
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-bold text-slate-700 whitespace-nowrap">設定対象拠点:</label>
          <select
            value={selectedOfficeId}
            onChange={(e) => {
              setSelectedOfficeId(e.target.value);
              setNotice(null);
            }}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
          >
            <option value="default">全社共通（デフォルト様式）</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} {o.code ? `(${o.code})` : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedOfficeId !== 'default' && (
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(currentConfig.useCustomConfig)}
              onChange={(e) =>
                updateCurrentConfig((prev) => ({
                  ...prev,
                  useCustomConfig: e.target.checked,
                }))
              }
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>この拠点独自の様式・自動適合ルールを有効にする（OFF時は全社共通を継承）</span>
          </label>
        )}
      </div>

      {/* 内部タブ切替 */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setInnerTab('items')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
            innerTab === 'items'
              ? 'bg-white text-indigo-700 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          <span>チェック項目・数値欄 ({currentConfig.checkItems.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setInnerTab('judgements')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
            innerTab === 'judgements'
              ? 'bg-white text-indigo-700 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>判定記号マスター ({currentConfig.judgementOptions.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setInnerTab('rules')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
            innerTab === 'rules'
              ? 'bg-white text-indigo-700 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span>在庫自動適合ルール ({currentConfig.autoMatchRules.length})</span>
        </button>
      </div>

      {/* TAB 1: チェック項目・数値欄カスタマイズ */}
      {innerTab === 'items' && (
        <div className="space-y-4">
          {/* 新規項目追加フォーム */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="text-xs font-bold text-slate-800">新しいチェック項目 / 数値入力欄を追加</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 text-xs">
              <div className="lg:col-span-2">
                <input
                  type="text"
                  value={newItemLabel}
                  onChange={(e) => setNewItemLabel(e.target.value)}
                  placeholder="項目名（例: 絶縁抵抗測定値、隙間実測値）"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <select
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                >
                  {orderedCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <select
                  value={newItemType}
                  onChange={(e) => setNewItemType(e.target.value as SelfInspectionInputType)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                >
                  <option value="judgement">判定記号選択</option>
                  <option value="number">数値入力</option>
                  <option value="text">テキスト入力</option>
                </select>
              </div>
              <div>
                {newItemType === 'number' ? (
                  <input
                    type="text"
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value)}
                    placeholder="単位 (例: mm, V, 秒)"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                ) : (
                  <input
                    type="text"
                    value={newItemDefault}
                    onChange={(e) => setNewItemDefault(e.target.value)}
                    placeholder="初期値 (例: ○, －)"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                )}
              </div>
              <div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="w-full px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>項目追加</span>
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-600">大区分（カテゴリ）を追加:</span>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="例: 測定値、拠点独自確認"
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs w-52"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                className="px-3 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold cursor-pointer"
              >
                カテゴリ追加
              </button>
            </div>
          </div>

          {/* カテゴリ別項目一覧 */}
          <div className="space-y-3">
            {orderedCategories.map((cat) => {
              const items = currentConfig.checkItems
                .filter((i) => i.category === cat.id)
                .sort((a, b) => a.order - b.order);

              return (
                <div key={cat.id} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">{cat.name}</span>
                    <span className="text-[11px] text-slate-500 font-mono tabular-nums">{items.length}項目</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.length === 0 ? (
                      <div className="px-3.5 py-3 text-xs text-slate-400">このカテゴリに項目はありません</div>
                    ) : (
                      items.map((item, idx) => (
                        <div
                          key={item.key}
                          className={`px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs ${
                            item.isActive ? 'bg-white' : 'bg-slate-50/80 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                            <input
                              type="text"
                              value={item.label}
                              onChange={(e) =>
                                updateCurrentConfig((prev) => ({
                                  ...prev,
                                  checkItems: prev.checkItems.map((ci) =>
                                    ci.key === item.key ? { ...ci, label: e.target.value } : ci
                                  ),
                                }))
                              }
                              className="flex-1 px-2 py-1 border border-slate-200 rounded-md text-xs text-slate-900"
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <select
                              value={item.inputType}
                              onChange={(e) =>
                                updateCurrentConfig((prev) => ({
                                  ...prev,
                                  checkItems: prev.checkItems.map((ci) =>
                                    ci.key === item.key
                                      ? { ...ci, inputType: e.target.value as SelfInspectionInputType }
                                      : ci
                                  ),
                                }))
                              }
                              className="px-2 py-1 border border-slate-200 rounded-md text-[11px] bg-white"
                            >
                              <option value="judgement">判定記号</option>
                              <option value="number">数値</option>
                              <option value="text">テキスト</option>
                            </select>

                            {item.inputType === 'number' ? (
                              <input
                                type="text"
                                value={item.unit || ''}
                                onChange={(e) =>
                                  updateCurrentConfig((prev) => ({
                                    ...prev,
                                    checkItems: prev.checkItems.map((ci) =>
                                      ci.key === item.key ? { ...ci, unit: e.target.value } : ci
                                    ),
                                  }))
                                }
                                placeholder="単位"
                                className="w-16 px-2 py-1 border border-slate-200 rounded-md text-[11px]"
                              />
                            ) : (
                              <input
                                type="text"
                                value={item.defaultVal || ''}
                                onChange={(e) =>
                                  updateCurrentConfig((prev) => ({
                                    ...prev,
                                    checkItems: prev.checkItems.map((ci) =>
                                      ci.key === item.key ? { ...ci, defaultVal: e.target.value } : ci
                                    ),
                                  }))
                                }
                                placeholder="初期値"
                                className="w-16 px-2 py-1 border border-slate-200 rounded-md text-[11px] text-center"
                                title="初期値"
                              />
                            )}

                            <button
                              type="button"
                              onClick={() => handleMoveItem(item.key, -1)}
                              disabled={idx === 0}
                              className="p-1 text-slate-500 hover:text-indigo-700 disabled:opacity-30 cursor-pointer"
                              title="上へ移動"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveItem(item.key, 1)}
                              disabled={idx === items.length - 1}
                              className="p-1 text-slate-500 hover:text-indigo-700 disabled:opacity-30 cursor-pointer"
                              title="下へ移動"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateCurrentConfig((prev) => ({
                                  ...prev,
                                  checkItems: prev.checkItems.map((ci) =>
                                    ci.key === item.key ? { ...ci, isActive: !ci.isActive } : ci
                                  ),
                                }))
                              }
                              className="p-1 text-slate-500 hover:text-indigo-700 cursor-pointer"
                              title={item.isActive ? '非表示にする' : '表示する'}
                            >
                              {item.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateCurrentConfig((prev) => ({
                                  ...prev,
                                  checkItems: prev.checkItems.filter((ci) => ci.key !== item.key),
                                }))
                              }
                              className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                              title="削除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: 判定記号マスター */}
      {innerTab === 'judgements' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-end gap-2 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">記号</label>
              <input
                type="text"
                value={newJudgeCode}
                onChange={(e) => setNewJudgeCode(e.target.value)}
                placeholder="例: ◎, 済"
                className="w-24 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">意味・ラベル</label>
              <input
                type="text"
                value={newJudgeLabel}
                onChange={(e) => setNewJudgeLabel(e.target.value)}
                placeholder="例: 確認済（特記事項なし）"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">ボタン色</label>
              <select
                value={newJudgeTone}
                onChange={(e) => setNewJudgeTone(e.target.value as SelfInspectionJudgementOption['tone'])}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
              >
                <option value="emerald">緑（良好）</option>
                <option value="indigo">青（確認）</option>
                <option value="amber">橙（注意）</option>
                <option value="rose">赤（不適合）</option>
                <option value="slate">灰（該当無）</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleAddJudgement}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>記号追加</span>
            </button>
          </div>

          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
            {currentConfig.judgementOptions.map((opt, idx) => (
              <div key={`${opt.code}-${idx}`} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className="min-w-[36px] text-center py-1 px-2 border border-slate-300 rounded-md font-bold bg-slate-50">
                    {opt.code}
                  </span>
                  <span className="font-semibold text-slate-800">{opt.label}</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateCurrentConfig((prev) => ({
                      ...prev,
                      judgementOptions: prev.judgementOptions.filter((_, i) => i !== idx),
                    }))
                  }
                  disabled={currentConfig.judgementOptions.length <= 1}
                  className="p-1 text-rose-500 hover:text-rose-700 disabled:opacity-30 cursor-pointer"
                  title="削除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: 在庫データ自動適合ルール（「この文言があったらON」カスタム） */}
      {innerTab === 'rules' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div>
              <div className="text-xs font-bold text-slate-800">
                在庫自動適合ルールを追加（「この文言があったらON / 自動設定」）
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                在庫DBの部品名・規格に指定キーワードが含まれている場合、自動的に自主検査書のチェック欄や仕様項目へ値をセットします。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 text-xs">
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">ルール名</label>
                <input
                  type="text"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  placeholder="例: インターロック自動ON"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">判定キーワード（カンマ区切り）</label>
                <input
                  type="text"
                  value={newRuleKeywords}
                  onChange={(e) => setNewRuleKeywords(e.target.value)}
                  placeholder="例: IL, インターロック, 風除室"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">対象項目</label>
                <select
                  value={newRuleField}
                  onChange={(e) => setNewRuleField(e.target.value as AutoMatchTargetField)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                >
                  {(Object.keys(TARGET_FIELD_LABELS) as AutoMatchTargetField[]).map((k) => (
                    <option key={k} value={k}>
                      {TARGET_FIELD_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>

              {newRuleField === 'checkItem' ? (
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">対象チェック項目</label>
                  <select
                    value={newRuleCheckKey}
                    onChange={(e) => setNewRuleCheckKey(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  >
                    {currentConfig.checkItems.map((ci) => (
                      <option key={ci.key} value={ci.key}>
                        {ci.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">一致条件</label>
                  <select
                    value={newRuleMatchMode}
                    onChange={(e) => setNewRuleMatchMode(e.target.value as 'any' | 'all')}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="any">いずれかを含む</option>
                    <option value="all">すべて含む</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">自動設定する値</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newRuleValue}
                    onChange={(e) => setNewRuleValue(e.target.value)}
                    placeholder="例: ○, 有"
                    className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddRule}
                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer"
                  >
                    追加
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
            {currentConfig.autoMatchRules.map((rule) => {
              const checkItemLabel =
                rule.targetField === 'checkItem'
                  ? currentConfig.checkItems.find((ci) => ci.key === rule.targetCheckKey)?.label || rule.targetCheckKey
                  : TARGET_FIELD_LABELS[rule.targetField];

              return (
                <div
                  key={rule.id}
                  className={`px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs ${
                    rule.enabled ? 'bg-white' : 'bg-slate-50 opacity-60'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-900">{rule.name}</div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      キーワード: <span className="font-mono font-semibold text-slate-800">{rule.keywords.join(' / ')}</span>
                      <span className="mx-1.5 text-slate-400">→</span>
                      <span>{checkItemLabel}</span>
                      <span className="mx-1 text-slate-400">=</span>
                      <span className="font-bold text-indigo-700">{rule.targetValue}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) =>
                          updateCurrentConfig((prev) => ({
                            ...prev,
                            autoMatchRules: prev.autoMatchRules.map((r) =>
                              r.id === rule.id ? { ...r, enabled: e.target.checked } : r
                            ),
                          }))
                        }
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span>有効</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        updateCurrentConfig((prev) => ({
                          ...prev,
                          autoMatchRules: prev.autoMatchRules.filter((r) => r.id !== rule.id),
                        }))
                      }
                      className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                      title="ルールを削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
