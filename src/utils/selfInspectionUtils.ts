import ExcelJS from 'exceljs';
import { API_BASE_URL } from '../config/api';
import { Site, SiteMainPart, SiteSubPart } from '../types/site';
import { User } from '../types';
import {
  InventoryAutoMatchRule,
  InventoryPartCandidate,
  SelfInspectionDoorRecord,
  SelfInspectionOfficeConfig,
  SelfInspectionRecord,
} from '../types/selfInspection';
import {
  BASEPLATE_MASTERS,
  BELT_MASTERS,
  CB_MASTERS,
  CRM_EXCEL_HEADERS_72,
  createDefaultSelfInspectionOfficeConfig,
  ELECTRIC_LOCK_MASTERS,
  MOTOR_MASTERS,
  ROLLER_MASTERS,
  SENSOR_MASTERS,
  SUB_SENSOR_MASTERS,
} from '../constants/selfInspectionMasters';
import { getFittingLabel } from './siteUtils';

// ============================================================
// 日付ユーティリティ (JST / Asia/Tokyo 厳格準拠)
// ============================================================

export function getTodayJstStr(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value || '2026';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const d = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}-${m}-${d}`;
}

/** 半角/全角・大文字小文字を吸収して検索用に正規化 */
export function normalizeForMatch(raw?: string): string {
  if (!raw) return '';
  return raw
    .normalize('NFKC')
    .toUpperCase()
    .replace(/\s+/g, '');
}

/** 部品マスターリストから最長一致する正規名称を返す */
function matchBestFromMaster(text: string, masterList: string[], excludeValues: string[] = ['無', 'なし', '特', 'A', 'B', 'J', 'L', 'F1', 'F2', 'F3', '手', 'MW', 'EB', 'BC', 'M4']): string {
  const normText = normalizeForMatch(text);
  if (!normText) return '';

  // 長い型番から優先して誤一致を防ぐ (例: OA-220V BUILTIN を OA-220V より先に評価)
  const sorted = [...masterList]
    .filter((m) => !excludeValues.includes(m))
    .sort((a, b) => b.length - a.length);

  for (const m of sorted) {
    const normM = normalizeForMatch(m);
    if (normM.length < 2) continue;
    if (normText.includes(normM)) {
      return m;
    }
  }
  return '';
}

/** セット台板の品名・規格から台板寸法 (L=4950 など) を抽出 */
function extractBaseplateDimension(text: string): string {
  if (!text) return '';
  const norm = text.normalize('NFKC');
  const m = norm.match(/L\s*=\s*(\d{3,5})/i);
  if (m && m[1]) return m[1];
  return '';
}

/** 在庫パーツ1行のカテゴリを自動判定 */
export function classifyInventoryPart(partName: string, partSpec?: string, explicitCategory?: string): InventoryPartCandidate['partCategory'] {
  if (explicitCategory) {
    const c = explicitCategory.toLowerCase();
    if (['set_baseplate', 'motor', 'cb', 'sensor', 'sub_sensor', 'beam', 'electric_lock', 'roller', 'belt', 'stopper'].includes(c)) {
      return c as InventoryPartCandidate['partCategory'];
    }
  }
  const combined = `${partName || ''} ${partSpec || ''}`.normalize('NFKC');
  const upper = combined.toUpperCase();

  if (combined.includes('セット台板') || combined.includes('ｾｯﾄ台板') || combined.includes('駆動装置')) return 'set_baseplate';
  if (combined.includes('ビーム') || combined.includes('ﾋﾞｰﾑ') || combined.includes('光線') || /OS-(?:10|20|15)/i.test(upper)) return 'beam';
  if (combined.includes('補助センサー') || combined.includes('補助ｾﾝｻｰ') || /HZ-C|DS-6N|PB-20/i.test(upper)) return 'sub_sensor';
  if (combined.includes('センサー') || combined.includes('ｾﾝｻｰ') || /OA-\d|OAT-|HA-T|HA-\d|HW-\d|OW-\d|OAW-|OAH-|FS-10/i.test(upper)) return 'sensor';
  if (combined.includes('電気錠') || /EL-|ELM|ELC-|BPM-|BP-C/i.test(upper)) return 'electric_lock';
  if (combined.includes('ストッパー') || combined.includes('ｽﾄｯﾊﾟｰ')) return 'stopper';
  if (combined.includes('戸車') || combined.includes('ハンガー') || combined.includes('ローラー')) return 'roller';
  if (combined.includes('ベルト') || combined.includes('ﾍﾞﾙﾄ') || combined.includes('チェーン') || combined.includes('ワイヤー')) return 'belt';
  if (combined.includes('CB') || /DCR-|DUC-|DCU-|DRH-|DCH-/i.test(upper)) return 'cb';
  if (matchBestFromMaster(combined, MOTOR_MASTERS)) return 'motor';
  return 'other';
}

/** カスタム自動適合ルール（「この文言があったらON」等）を扉データへ適用 */
export function applyAutoMatchRulesToDoor(
  door: SelfInspectionDoorRecord,
  combinedInventoryText: string,
  rules: InventoryAutoMatchRule[],
  overwriteExisting: boolean = false
): SelfInspectionDoorRecord {
  if (!combinedInventoryText || !rules || rules.length === 0) return door;
  const normText = normalizeForMatch(combinedInventoryText);
  const next: SelfInspectionDoorRecord = {
    ...door,
    checkResults: { ...door.checkResults },
  };

  for (const rule of rules) {
    if (!rule.enabled || !Array.isArray(rule.keywords) || rule.keywords.length === 0) continue;
    const validKeywords = rule.keywords.map((k) => normalizeForMatch(k)).filter(Boolean);
    if (validKeywords.length === 0) continue;

    const matched =
      rule.matchMode === 'all'
        ? validKeywords.every((kw) => normText.includes(kw))
        : validKeywords.some((kw) => normText.includes(kw));

    if (!matched) continue;

    const val = rule.targetValue;
    switch (rule.targetField) {
      case 'openingMethod':
        if (overwriteExisting || !next.openingMethod) next.openingMethod = val;
        break;
      case 'mountMethod':
        if (overwriteExisting || !next.mountMethod) next.mountMethod = val;
        break;
      case 'doorType':
        if (overwriteExisting || !next.doorType) next.doorType = val;
        break;
      case 'emergencyPower':
        if (overwriteExisting || !next.emergencyPower || next.emergencyPower === '無') next.emergencyPower = val;
        break;
      case 'fireAlarmSignal':
        if (overwriteExisting || !next.fireAlarmSignal || next.fireAlarmSignal === '無') next.fireAlarmSignal = val;
        break;
      case 'fireProtectionEquipment':
        if (overwriteExisting || !next.fireProtectionEquipment || next.fireProtectionEquipment === '無') next.fireProtectionEquipment = val;
        break;
      case 'fireCompartment':
        if (overwriteExisting || !next.fireCompartment) next.fireCompartment = val;
        break;
      case 'electricLock':
        if (overwriteExisting || !next.electricLockModel || next.electricLockModel === '無') next.electricLockModel = val;
        break;
      case 'beamSensor':
        if (overwriteExisting || !next.beamSensor || next.beamSensor === '無') next.beamSensor = val;
        break;
      case 'powerSwitchPos':
        if (overwriteExisting || !next.powerSwitchPos) next.powerSwitchPos = val;
        break;
      case 'wallSwitch':
        if (overwriteExisting || !next.wallSwitch) next.wallSwitch = val;
        break;
      case 'checkItem':
        if (rule.targetCheckKey) {
          if (overwriteExisting || !next.checkResults[rule.targetCheckKey] || next.checkResults[rule.targetCheckKey] === '－') {
            next.checkResults[rule.targetCheckKey] = val;
          }
        }
        break;
    }
  }

  return next;
}

/** 拠点別設定の解決（指定拠点にカスタム設定がなければ default を継承） */
export function resolveEffectiveOfficeConfig(
  allConfigs: SelfInspectionOfficeConfig[],
  officeId?: string
): SelfInspectionOfficeConfig {
  const defaultCfg =
    allConfigs.find((c) => c.officeId === 'default') ||
    createDefaultSelfInspectionOfficeConfig('default', '全社共通（デフォルト）');

  if (officeId && officeId !== 'default') {
    const officeCfg = allConfigs.find((c) => String(c.officeId) === String(officeId));
    if (officeCfg && officeCfg.useCustomConfig) {
      return {
        ...defaultCfg,
        ...officeCfg,
        categories: officeCfg.categories?.length ? officeCfg.categories : defaultCfg.categories,
        checkItems: officeCfg.checkItems?.length ? officeCfg.checkItems : defaultCfg.checkItems,
        judgementOptions: officeCfg.judgementOptions?.length ? officeCfg.judgementOptions : defaultCfg.judgementOptions,
        autoMatchRules: officeCfg.autoMatchRules?.length ? officeCfg.autoMatchRules : defaultCfg.autoMatchRules,
      };
    }
  }
  return defaultCfg;
}

/** 空の扉1台分レコードを作成 */
export function createEmptySelfInspectionDoor(
  doorIndex: number,
  config: SelfInspectionOfficeConfig,
  overrides?: Partial<SelfInspectionDoorRecord>
): SelfInspectionDoorRecord {
  const defaultChecks: Record<string, string> = {};
  for (const item of config.checkItems) {
    if (item.isActive && item.defaultVal !== undefined) {
      defaultChecks[item.key] = item.defaultVal;
    }
  }

  return {
    id: `door-${Date.now()}-${doorIndex}-${Math.random().toString(36).slice(2, 6)}`,
    doorIndex,
    floor: '',
    fittingNo: '',
    location: '',
    locationKana: '',
    doorMaterial: '',
    manufacturer: '寺岡オートドア',
    doorType: '',
    openingMethod: '',
    mountMethod: '',
    baseplateDimension: '',
    cornerBracket: '',
    doorWeight: '',
    doorSizeH: '',
    doorSizeW: '',
    hpDimension: '',
    glassType: '',
    powerSwitchPos: '',
    wallSwitch: '',
    contactSticker: '有',
    cautionSticker: '有',
    protectiveFence: '',
    engineModel: '',
    engineSerialNo: '',
    engineInstallDate: '',
    cbModel: '',
    cbSerialNo: '',
    cbInstallDate: '',
    electricLockModel: '無',
    electricLockLot: '',
    electricLockCbModel: '',
    electricLockCbLot: '',
    outerSensorMain: '',
    outerSensorMainLot: '',
    outerSensorSub: '',
    outerSensorSubLot: '',
    innerSensorMain: '',
    innerSensorMainLot: '',
    innerSensorSub: '',
    innerSensorSubLot: '',
    beamSensor: '',
    beamSensorLot: '',
    otherSwitch: '',
    roller: '',
    belt: '',
    baseplate: '',
    effectiveOpeningMm: '',
    openSpeed: '',
    closeSpeed: '',
    holdOpenTimeSec: '',
    fireAlarmSignal: '無',
    fireCompartment: '',
    fireProtectionEquipment: '無',
    emergencyPower: '無',
    checkResults: defaultChecks,
    specRemarks: '',
    partsRemarks: '',
    doorLedgerInputBy: '',
    constructionInputBy: '',
    inventoryCandidates: [],
    ...overrides,
  };
}

/**
 * 現場情報 ＋ 在庫DB部品リストから扉1台分へ自動適合して値を流し込む
 */
export function enrichDoorWithInventoryParts(
  door: SelfInspectionDoorRecord,
  partsForDoor: InventoryPartCandidate[],
  config: SelfInspectionOfficeConfig,
  options?: { overwriteExisting?: boolean; installDateFallback?: string }
): SelfInspectionDoorRecord {
  const overwrite = Boolean(options?.overwriteExisting);
  let next: SelfInspectionDoorRecord = {
    ...door,
    checkResults: { ...door.checkResults },
    inventoryCandidates: partsForDoor,
  };

  if (partsForDoor.length === 0) return next;

  const detectedMainSensors: string[] = [];
  const detectedSubSensors: string[] = [];
  const detectedBeams: string[] = [];
  const combinedTexts: string[] = [];

  for (const p of partsForDoor) {
    const text = `${p.partName || ''} ${p.partSpec || ''} ${p.partCode || ''}`.trim();
    combinedTexts.push(text);
    const category = classifyInventoryPart(p.partName, p.partSpec, p.partCategory);
    p.partCategory = category;

    // 台板寸法 (L=4950 など)
    const dim = extractBaseplateDimension(text);
    if (dim && (overwrite || !next.baseplateDimension)) {
      next.baseplateDimension = dim;
    }

    // モーター（エンジン機種）
    const matchedMotor = matchBestFromMaster(text, MOTOR_MASTERS);
    if (matchedMotor) {
      p.matchedMaster = p.matchedMaster || matchedMotor;
      if (overwrite || !next.engineModel) next.engineModel = matchedMotor;
    }

    // CB（改造）
    const matchedCb = matchBestFromMaster(text, CB_MASTERS);
    if (matchedCb && (category === 'cb' || category === 'set_baseplate')) {
      if (overwrite || !next.cbModel) next.cbModel = matchedCb;
    }

    // 電気錠
    if (category === 'electric_lock' || /EL-|ELM|ELC-|BPM-/i.test(text)) {
      const matchedLock = matchBestFromMaster(text, ELECTRIC_LOCK_MASTERS);
      if (matchedLock) {
        p.matchedMaster = matchedLock;
        if (overwrite || !next.electricLockModel || next.electricLockModel === '無') {
          next.electricLockModel = matchedLock;
        }
      }
    }

    // 補助光線・ビームSW
    if (category === 'beam' || category === 'sub_sensor') {
      const matchedSub = matchBestFromMaster(text, SUB_SENSOR_MASTERS);
      if (matchedSub) {
        p.matchedMaster = matchedSub;
        if (category === 'beam') {
          detectedBeams.push(matchedSub);
        } else {
          detectedSubSensors.push(matchedSub);
        }
      }
    }

    // 起動センサー
    if (category === 'sensor') {
      const matchedSensor = matchBestFromMaster(text, SENSOR_MASTERS);
      if (matchedSensor) {
        p.matchedMaster = matchedSensor;
        detectedMainSensors.push(matchedSensor);
      }
    }

    // 戸車（セット台板のカンマトークン例: H1, MDS にも対応）
    const matchedRoller = matchBestFromMaster(text, ROLLER_MASTERS);
    if (matchedRoller && (overwrite || !next.roller)) {
      next.roller = matchedRoller;
    } else if (category === 'set_baseplate') {
      const tokens = text.normalize('NFKC').split(/[,、\s/]+/).map((t) => t.trim().toUpperCase());
      if (tokens.includes('H1') && (overwrite || !next.roller)) next.roller = 'H1戸車';
      else if (tokens.includes('M3') && (overwrite || !next.roller)) next.roller = 'M3戸車セット';
      else if (tokens.includes('D3') && (overwrite || !next.roller)) next.roller = 'D3用1ヶ戸車';
    }

    // ベルト
    const matchedBelt = matchBestFromMaster(text, BELT_MASTERS);
    if (matchedBelt && (overwrite || !next.belt)) {
      next.belt = matchedBelt;
    }

    // 台板（セット台板のカンマトークン例: H1, MDS, M3 にも対応）
    const matchedBase = matchBestFromMaster(text, BASEPLATE_MASTERS);
    if (matchedBase && (overwrite || !next.baseplate)) {
      next.baseplate = matchedBase;
    } else if (category === 'set_baseplate') {
      const tokens = text.normalize('NFKC').split(/[,、\s/]+/).map((t) => t.trim().toUpperCase());
      if (tokens.includes('MDS') && tokens.includes('H1') && (overwrite || !next.baseplate)) next.baseplate = 'MDSH1';
      else if (tokens.includes('MDS') && tokens.includes('M3') && (overwrite || !next.baseplate)) next.baseplate = 'MDSM3台板';
      else if (tokens.includes('H1') && (overwrite || !next.baseplate)) next.baseplate = 'H1台板';
      else if (tokens.includes('M3') && (overwrite || !next.baseplate)) next.baseplate = 'M3台板';
      else if (tokens.includes('D3') && (overwrite || !next.baseplate)) next.baseplate = 'D3台板';
    }
  }

  // 暫定センサー配置（外・内は在庫から判別不可のため仮セット。UI上でワンタップ入替可能）
  if (detectedMainSensors.length >= 1 && (overwrite || !next.outerSensorMain)) {
    next.outerSensorMain = detectedMainSensors[0];
  }
  if (detectedMainSensors.length >= 2 && (overwrite || !next.innerSensorMain)) {
    next.innerSensorMain = detectedMainSensors[1];
  } else if (detectedMainSensors.length === 1 && (overwrite || !next.innerSensorMain)) {
    // 1種類のみ検出時は内側にも同一型式を仮入れしない（実態に合わせて1つだけ仮配置し候補から選択しやすくする）
  }
  if (detectedSubSensors.length >= 1 && (overwrite || !next.outerSensorSub)) {
    next.outerSensorSub = detectedSubSensors[0];
  }
  if (detectedSubSensors.length >= 2 && (overwrite || !next.innerSensorSub)) {
    next.innerSensorSub = detectedSubSensors[1];
  }
  if (detectedBeams.length >= 1 && (overwrite || !next.beamSensor)) {
    next.beamSensor = detectedBeams[0];
  }

  if (options?.installDateFallback && (overwrite || !next.engineInstallDate)) {
    next.engineInstallDate = options.installDateFallback;
  }

  // カスタム自動適合ルール（「この文言があったらON」等）を適用
  next = applyAutoMatchRulesToDoor(next, combinedTexts.join(' '), config.autoMatchRules, overwrite);

  return next;
}

/** 現場データ (Site) ＋ 外部在庫明細パーツ群から自主検査書レコードの初期ドラフトを作成 */
export function buildInitialSelfInspectionFromSite(
  site: Site,
  currentUser: User,
  config: SelfInspectionOfficeConfig,
  externalParts: Array<Record<string, any>> = []
): SelfInspectionRecord {
  const todayStr = getTodayJstStr();
  const nowIso = new Date().toISOString();

  // 外部在庫パーツを建具番号ごとに整理
  const externalByFitting = new Map<string, InventoryPartCandidate[]>();
  const externalUnassigned: InventoryPartCandidate[] = [];

  for (const p of externalParts) {
    const fNo = String(p.fittingNo || p.建具番号 || p.tateguNo || p.fitting_no || '').trim();
    const cand: InventoryPartCandidate = {
      id: p.id ? String(p.id) : undefined,
      fittingNo: fNo || undefined,
      partName: String(p.partName || p.name || p.品名 || '').trim(),
      partSpec: String(p.partSpec || p.部品規格 || '').trim() || undefined,
      partCode: String(p.partCode || p.modelNumber || p.code || '').trim() || undefined,
      partCategory: classifyInventoryPart(
        String(p.partName || p.name || p.品名 || ''),
        String(p.partSpec || p.部品規格 || ''),
        p.partCategory
      ),
      quantity: Number(p.quantity || p.count || 1) || 1,
      inStockDate: p.inStockDate || p.inboundDate || undefined,
      outStockDate: p.outStockDate || p.outboundDate || undefined,
      status: p.status || p.stockStatus || undefined,
    };
    if (!cand.partName && !cand.partCode) continue;

    if (fNo) {
      const key = normalizeForMatch(fNo);
      const list = externalByFitting.get(key) || [];
      list.push(cand);
      externalByFitting.set(key, list);
    } else {
      externalUnassigned.push(cand);
    }
  }

  // subPartsCache も建具番号があれば取り込む
  for (const sp of site.subPartsCache || []) {
    const fNo = String((sp as any).fittingNo || '').trim();
    const cand: InventoryPartCandidate = {
      id: sp.id,
      fittingNo: fNo || undefined,
      partName: sp.partName || '',
      partSpec: (sp as any).partSpec || undefined,
      partCode: sp.partCode || undefined,
      partCategory: classifyInventoryPart(sp.partName || '', (sp as any).partSpec || ''),
      quantity: sp.quantity,
      inStockDate: sp.inStockDate,
      outStockDate: sp.outStockDate,
    };
    if (fNo) {
      const key = normalizeForMatch(fNo);
      const list = externalByFitting.get(key) || [];
      if (!list.some((x) => x.partName === cand.partName && x.partSpec === cand.partSpec)) {
        list.push(cand);
        externalByFitting.set(key, list);
      }
    } else {
      if (!externalUnassigned.some((x) => x.partName === cand.partName && x.partCode === cand.partCode)) {
        externalUnassigned.push(cand);
      }
    }
  }

  const sourceParts: SiteMainPart[] =
    site.mainParts && site.mainParts.length > 0
      ? site.mainParts
      : Array.from({ length: Math.max(1, site.egCount || 1) }, (_, idx) => ({
          id: `virtual-part-${idx + 1}`,
          partCode: '',
          partName: '',
          quantity: 1,
          unit: '台',
          unitIndex: idx + 1,
          status: 'waiting_stock' as const,
        }));

  const doors: SelfInspectionDoorRecord[] = sourceParts.map((mp, idx) => {
    const fittingLabel = getFittingLabel(mp, idx, site.egCount || sourceParts.length);
    const fittingKey = normalizeForMatch(fittingLabel);

    const doorBase = createEmptySelfInspectionDoor(idx + 1, config, {
      mainPartId: mp.id,
      fittingNo: mp.fittingNo || fittingLabel,
      engineSerialNo: mp.serialNo || '',
      engineInstallDate: mp.constructionDate || site.constructionDate || '',
      constructionInputBy: mp.workerName || site.primaryWorkerName || currentUser.name,
      doorLedgerInputBy: currentUser.name,
    });

    // 主要部品自身も解析対象候補へ追加
    const candidates: InventoryPartCandidate[] = [];
    if (mp.partName || mp.partCode || mp.partSpec) {
      candidates.push({
        id: mp.id,
        fittingNo: mp.fittingNo || fittingLabel,
        partName: mp.partName || '',
        partSpec: mp.partSpec || undefined,
        partCode: mp.partCode || undefined,
        partCategory: classifyInventoryPart(mp.partName || '', mp.partSpec || mp.partCode || ''),
        quantity: 1,
        inStockDate: mp.inStockDate,
        outStockDate: mp.outStockDate,
      });
    }

    const matchedExt = externalByFitting.get(fittingKey) || [];
    for (const ext of matchedExt) {
      if (!candidates.some((c) => c.partName === ext.partName && c.partSpec === ext.partSpec)) {
        candidates.push(ext);
      }
    }
    // 建具番号がない現場全体部品でセンサー・電気錠等があれば候補へ添える
    if (sourceParts.length === 1 && externalUnassigned.length > 0) {
      for (const ext of externalUnassigned) {
        if (!candidates.some((c) => c.partName === ext.partName && c.partSpec === ext.partSpec)) {
          candidates.push(ext);
        }
      }
    }

    return enrichDoorWithInventoryParts(doorBase, candidates, config, {
      overwriteExisting: false,
      installDateFallback: mp.constructionDate || site.constructionDate || '',
    });
  });

  return {
    id: `self-insp-${site.id}`,
    siteId: site.id,
    siteCode: site.siteCode || '',
    siteName: site.siteName || '',
    drawingNo: site.orderNo || '',
    inspectionDate: site.constructionDate || todayStr,
    inspectorId: currentUser.id,
    inspectorName: site.primaryWorkerName || currentUser.name,
    officeId: currentUser.officeId || 'default',
    officeName: currentUser.office || '全社共通',
    managementNo: '',
    contractClient: site.customerName || '',
    constructionName: site.siteName || '',
    buildingName: site.siteName || '',
    buildingNameKana: '',
    postalCode: '',
    buildingAddress: site.address || '',
    constructionCompany: site.customerName || '',
    constructionCompanyContact: '',
    designOffice: '',
    designOfficeContact: '',
    sashVendor: '',
    sashVendorContact: '',
    ownerName: '',
    ownerContact: '',
    siteRemarks: site.notes || '',
    siteInputBy: currentUser.name,
    buildingUse: '',
    contactNotes: '',
    doors,
    createdAt: nowIso,
    updatedAt: nowIso,
    updatedByName: currentUser.name,
  };
}

// ============================================================
// CRM連携用 Excel (.xlsx / 1シート / A〜BT 72列) 出力
// ============================================================

export async function exportSelfInspectionToCrmExcel(record: SelfInspectionRecord): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = record.inspectorName || '寺岡オート・ドアシステムSNS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('CRM取込用', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // 1行目: 完全72列ヘッダー (A〜BT、AWとBPは空白)
  const headerRow = sheet.addRow(CRM_EXCEL_HEADERS_72);
  headerRow.height = 24;
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const val = CRM_EXCEL_HEADERS_72[colNumber - 1];
    cell.font = { name: 'Yu Gothic UI', size: 10, bold: true, color: { argb: 'FF1E293B' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: val ? 'FFE2E8F0' : 'FFF8FAFC' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF64748B' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  // 2行目以降: 扉ごとに1行出力
  for (const door of record.doors) {
    const rowValues: string[] = [
      record.managementNo || '',                 // A (1) 管理番号
      record.contractClient || '',               // B (2) 契約先
      record.constructionName || record.siteName || '', // C (3) 工事名称
      record.buildingName || record.siteName || '',     // D (4) 建物名称
      record.buildingNameKana || '',             // E (5) 建物名称カナ（半角）
      record.postalCode || '',                   // F (6) 郵便番号
      record.buildingAddress || '',              // G (7) 建物住所
      record.constructionCompany || '',          // H (8) 建設会社
      record.constructionCompanyContact || '',   // I (9) 連絡先
      record.designOffice || '',                 // J (10) 設計事務所
      record.designOfficeContact || '',          // K (11) 連絡先
      record.sashVendor || '',                   // L (12) サッシ業者
      record.sashVendorContact || '',            // M (13) 連絡先
      record.ownerName || '',                    // N (14) 施主
      record.ownerContact || '',                 // O (15) 連絡先
      record.siteRemarks || '',                  // P (16) 備考
      record.siteInputBy || '',                  // Q (17) 入力者
      record.siteCode || '',                     // R (18) 現場コード
      door.fittingNo || '',                      // S (19) 建具符号
      door.location || '',                       // T (20) 設置場所
      door.locationKana || '',                   // U (21) 設置場所カナ（半角）
      door.doorMaterial || '',                   // V (22) 建具材質
      door.manufacturer || '',                   // W (23) メーカー
      door.openingMethod || '',                  // X (24) 開閉方式
      door.mountMethod || '',                    // Y (25) EG納まり
      door.baseplateDimension || '',             // Z (26) 台板寸法
      door.cornerBracket || '',                  // AA (27) コーナーブラケット
      door.doorWeight || '',                     // AB (28) 扉重量
      door.doorSizeH || '',                      // AC (29) 扉サイズH
      door.doorSizeW || '',                      // AD (30) 扉サイズW
      door.hpDimension || '',                    // AE (31) HP寸法
      door.glassType || '',                      // AF (32) ガラス
      door.fireAlarmSignal || '',                // AG (33) 火報信号
      door.fireCompartment || '',                // AH (34) 防火区画
      door.fireProtectionEquipment || '',        // AI (35) 防火設備
      door.emergencyPower || '',                 // AJ (36) 非常電源
      record.drawingNo || '',                    // AK (37) 図面番号
      door.specRemarks || '',                    // AL (38) 備考
      door.doorLedgerInputBy || record.siteInputBy || '', // AM (39) 入力者
      door.powerSwitchPos || '',                 // AN (40) 電源SW
      door.wallSwitch || '',                     // AO (41) 壁SW
      door.contactSticker || '',                 // AP (42) 連絡先ステッカー
      door.cautionSticker || '',                 // AQ (43) 注意ステッカー
      door.protectiveFence || '',                // AR (44) 防護柵
      door.engineModel || '',                    // AS (45) モーター
      door.engineSerialNo || '',                 // AT (46) 製造№
      door.engineInstallDate || record.inspectionDate || '', // AU (47) 取付日
      door.cbModel || '',                        // AV (48) CB（改造）
      '',                                        // AW (49) 空白列
      door.cbSerialNo || '',                     // AX (50) 製造№
      door.cbInstallDate || '',                  // AY (51) 取付日
      door.electricLockModel || '',              // AZ (52) 電気錠　本体
      door.electricLockLot || '',                // BA (53) ロット番号
      door.electricLockCbModel || '',            // BB (54) 電気錠　CB
      door.electricLockCbLot || '',              // BC (55) ロット番号
      door.outerSensorMain || '',                // BD (56) センサー　外　起動
      door.outerSensorMainLot || '',             // BE (57) ロット番号
      door.outerSensorSub || '',                 // BF (58) センサー　外　補助
      door.outerSensorSubLot || '',              // BG (59) ロット番号
      door.innerSensorMain || '',                // BH (60) センサー　内　起動
      door.innerSensorMainLot || '',             // BI (61) ロット番号
      door.innerSensorSub || '',                 // BJ (62) センサー　内　補助
      door.innerSensorSubLot || '',              // BK (63) ロット番号
      door.beamSensor || '',                     // BL (64) センサー　補助
      door.beamSensorLot || '',                  // BM (65) ロット番号
      door.roller || '',                         // BN (66) 戸車
      door.belt || '',                           // BO (67) ベルト
      '',                                        // BP (68) 空白列
      door.baseplate || '',                      // BQ (69) 台板
      door.partsRemarks || '',                   // BR (70) 備考
      door.constructionInputBy || record.inspectorName || '', // BS (71) 工事入力者
      record.buildingUse || '',                  // BT (72) 建物用途(名前）
    ];

    const dataRow = sheet.addRow(rowValues);
    dataRow.height = 20;
    dataRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Yu Gothic UI', size: 10, color: { argb: 'FF0F172A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  }

  // 列幅の自動調整
  CRM_EXCEL_HEADERS_72.forEach((header, idx) => {
    const col = sheet.getColumn(idx + 1);
    if (!header) {
      col.width = 4;
      return;
    }
    let maxLen = header.length * 1.6;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const val = String(row.getCell(idx + 1).value || '');
      if (val.length * 1.3 > maxLen) maxLen = val.length * 1.3;
    });
    col.width = Math.min(Math.max(10, Math.ceil(maxLen) + 2), 34);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = (record.siteCode || record.siteName || '現場').replace(/[\\/:*?"<>|]/g, '_');
  const datePart = (record.inspectionDate || getTodayJstStr()).replace(/-/g, '');
  link.href = url;
  link.download = `CRM連携_${safeName}_${datePart}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================
// API 通信関数（API_BASE_URL 必須利用）
// ============================================================

export async function fetchSelfInspectionBySiteId(siteId: string): Promise<SelfInspectionRecord | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/sites/self-inspections/${encodeURIComponent(siteId)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.record || null;
  } catch (err) {
    console.warn('[SelfInspection] fetch failed:', err);
    return null;
  }
}

export async function saveSelfInspectionRecord(record: SelfInspectionRecord): Promise<{ success: boolean; record?: SelfInspectionRecord; error?: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/sites/self-inspections/${encodeURIComponent(record.siteId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      return { success: true, record: json.record || record };
    }
    return { success: false, error: json?.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: err?.message || '通信エラー' };
  }
}

export async function fetchSelfInspectionOfficeConfigs(): Promise<SelfInspectionOfficeConfig[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/sites/self-inspections/configs`);
    if (!res.ok) return [createDefaultSelfInspectionOfficeConfig()];
    const json = await res.json();
    const list = Array.isArray(json?.configs) ? json.configs : [];
    if (!list.some((c: SelfInspectionOfficeConfig) => c.officeId === 'default')) {
      return [createDefaultSelfInspectionOfficeConfig(), ...list];
    }
    return list;
  } catch (err) {
    console.warn('[SelfInspection] fetch configs failed:', err);
    return [createDefaultSelfInspectionOfficeConfig()];
  }
}

export async function saveSelfInspectionOfficeConfig(
  officeId: string,
  config: SelfInspectionOfficeConfig
): Promise<{ success: boolean; config?: SelfInspectionOfficeConfig; error?: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/sites/self-inspections/configs/${encodeURIComponent(officeId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      return { success: true, config: json.config || config };
    }
    return { success: false, error: json?.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: err?.message || '通信エラー' };
  }
}
