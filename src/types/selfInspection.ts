export type SelfInspectionInputType = 'judgement' | 'number' | 'text' | 'select';

export interface SelfInspectionJudgementOption {
  code: string;
  label: string;
  tone?: 'emerald' | 'rose' | 'amber' | 'slate' | 'indigo';
}

export interface SelfInspectionCheckCategoryDef {
  id: string;
  name: string;
  order: number;
  description?: string;
}

export interface SelfInspectionCheckItemDef {
  key: string;
  label: string;
  subGroup?: string; // 例: '外側' | '内側'
  category: string;  // SelfInspectionCheckCategoryDef.id
  inputType: SelfInspectionInputType;
  unit?: string;     // 例: 'mm', '秒', 'V'
  options?: string[]; // inputType === 'select' の場合の選択肢
  placeholder?: string;
  defaultVal?: string;
  order: number;
  isActive: boolean;
  /** 自主検査書の標準印刷表に出力するか */
  showInPrint?: boolean;
}

export type AutoMatchTargetField =
  | 'openingMethod'
  | 'mountMethod'
  | 'doorType'
  | 'emergencyPower'
  | 'fireAlarmSignal'
  | 'fireProtectionEquipment'
  | 'fireCompartment'
  | 'electricLock'
  | 'beamSensor'
  | 'powerSwitchPos'
  | 'wallSwitch'
  | 'checkItem';

export interface InventoryAutoMatchRule {
  id: string;
  name: string;
  keywords: string[];       // いずれか / すべて一致で発動
  matchMode: 'any' | 'all';
  targetField: AutoMatchTargetField;
  /** targetField === 'checkItem' の場合はチェック項目キー */
  targetCheckKey?: string;
  /** 自動セットする値 (例: '有', '○', '両引', '1.オープン') */
  targetValue: string;
  enabled: boolean;
  description?: string;
}

export interface SelfInspectionOfficeConfig {
  /** 'default' (全社共通) または OfficeMaster.id */
  officeId: string;
  officeCode?: string;
  officeName?: string;
  /** 拠点カスタマイズを有効にするか (false の場合は全社共通を継承) */
  useCustomConfig?: boolean;
  categories: SelfInspectionCheckCategoryDef[];
  checkItems: SelfInspectionCheckItemDef[];
  judgementOptions: SelfInspectionJudgementOption[];
  autoMatchRules: InventoryAutoMatchRule[];
  updatedAt?: string;
  updatedBy?: string;
}

/** 在庫明細から紐付いた候補部品（画面上の暫定選択・入替用） */
export interface InventoryPartCandidate {
  id?: string;
  fittingNo?: string;
  partName: string;
  partSpec?: string;
  partCode?: string;
  partCategory?: 'set_baseplate' | 'motor' | 'cb' | 'sensor' | 'sub_sensor' | 'beam' | 'electric_lock' | 'roller' | 'belt' | 'stopper' | 'other';
  quantity?: number;
  inStockDate?: string;
  outStockDate?: string;
  status?: string;
  matchedMaster?: string;
}

/** 扉1台分の自主検査書 ＋ CRM台帳データ */
export interface SelfInspectionDoorRecord {
  id: string;
  doorIndex: number;               // NO (1, 2, 3...)
  mainPartId?: string;             // SiteMainPart.id との紐付け

  // --- 扉諸元（自主検査書 ＋ CRM共通） ---
  floor: string;                   // 階数
  fittingNo: string;               // 建具番号 / 建具符号 (S列)
  location: string;                // 設置場所 (T列)
  locationKana: string;            // 設置場所カナ（半角） (U列)
  doorMaterial: string;            // 建具材質 (V列)
  manufacturer: string;            // メーカー (W列)
  doorType: string;                // ドア種類: 1.框 / 2.強化ガラス / 3.フラッシュ / 4.格子 / 5.その他
  openingMethod: string;           // 開閉方式 (X列: 両引/片引等)
  mountMethod: string;             // 取付方法 / EG納まり (Y列: 無目/天井/直付/床埋等)
  baseplateDimension: string;      // 台板寸法 (Z列)
  cornerBracket: string;           // コーナーブラケット (AA列)
  doorWeight: string;              // 扉重量 (AB列)
  doorSizeH: string;               // 扉サイズH (AC列)
  doorSizeW: string;               // 扉サイズW (AD列)
  hpDimension: string;             // HP寸法 (AE列)
  glassType: string;               // ガラス (AF列)

  // --- 電源・安全・ステッカー ---
  powerSwitchPos: string;          // 電源スイッチ位置 (AN列: 内観左/中央/内観右)
  wallSwitch: string;              // 壁SW (AO列)
  contactSticker: string;          // 連絡先ステッカー (AP列)
  cautionSticker: string;          // 注意ステッカー (AQ列)
  protectiveFence: string;         // 防護柵 (AR列)

  // --- エンジン・CB・電気錠 ---
  engineModel: string;             // エンジン機種 / モーター (AS列)
  engineSerialNo: string;          // エンジン シリアルNo. / 製造№ (AT列)
  engineInstallDate: string;       // モーター取付日 (AU列)
  cbModel: string;                 // CB（改造） (AV列)
  cbSerialNo: string;              // CB製造№ (AX列)
  cbInstallDate: string;           // CB取付日 (AY列)
  electricLockModel: string;       // 電気錠 本体 (AZ列)
  electricLockLot: string;         // 電気錠 ロット番号 (BA列)
  electricLockCbModel: string;     // 電気錠 CB (BB列)
  electricLockCbLot: string;       // 電気錠 CB ロット番号 (BC列)

  // --- センサー類 ---
  outerSensorMain: string;         // センサー 外 起動 (BD列)
  outerSensorMainLot: string;      // ロット番号 (BE列)
  outerSensorSub: string;          // センサー 外 補助 (BF列)
  outerSensorSubLot: string;       // ロット番号 (BG列)
  innerSensorMain: string;         // センサー 内 起動 (BH列)
  innerSensorMainLot: string;      // ロット番号 (BI列)
  innerSensorSub: string;          // センサー 内 補助 (BJ列)
  innerSensorSubLot: string;       // ロット番号 (BK列)
  beamSensor: string;              // センサー 補助（補助光線） (BL列)
  beamSensorLot: string;           // 補助光線 ロット番号 (BM列)
  otherSwitch: string;             // その他起動スイッチ（自主検査書欄）

  // --- その他部材 ---
  roller: string;                  // 戸車 (BN列)
  belt: string;                    // ベルト (BO列)
  baseplate: string;               // 台板 (BQ列)

  // --- 扉寸法・動作 ---
  effectiveOpeningMm: string;      // 有効開口(mm)
  openSpeed: string;               // 開速度 (9〜1 or mm/sec)
  closeSpeed: string;              // 閉速度 (9〜1 or mm/sec)
  holdOpenTimeSec: string;         // 開き保持時間(秒)

  // --- 特殊仕様 ---
  fireAlarmSignal: string;         // 火報信号 (AG列: 1.オープン / 2.クローズ / 無 等)
  fireCompartment: string;         // 防火区画 (AH列)
  fireProtectionEquipment: string; // 防火設備 (AI列)
  emergencyPower: string;          // 非常電源 (AJ列)

  // --- チェックリスト結果（項目key -> 記号 or 数値 or テキスト） ---
  checkResults: Record<string, string>;

  // --- 備考・入力者 ---
  specRemarks: string;             // 建具仕様備考 (AL列)
  partsRemarks: string;            // 部材備考 (BR列)
  doorLedgerInputBy: string;       // 入力者 (AM列)
  constructionInputBy: string;     // 工事入力者 (BS列)

  // --- 在庫明細候補（画面上でのワンタップ割当用） ---
  inventoryCandidates?: InventoryPartCandidate[];
}

/** 現場単位の自主検査書 ＋ CRM台帳ヘッダーレコード */
export interface SelfInspectionRecord {
  id: string;
  siteId: string;
  siteCode: string;                // 現場コード (R列)
  siteName: string;                // 現場名
  drawingNo: string;               // 図面番号 (AK列)
  inspectionDate: string;          // 検査日 (YYYY-MM-DD)
  inspectorId: string;             // 担当者ID
  inspectorName: string;           // 担当者名（自主検査書「担当」欄）
  officeId?: string;               // 適用拠点ID（マスターID準拠）
  officeName?: string;             // 適用拠点名

  // --- CRM連携 現場ヘッダー情報 (A〜Q列, BT列) ---
  managementNo: string;            // 管理番号 (A列)
  contractClient: string;          // 契約先 (B列)
  constructionName: string;        // 工事名称 (C列)
  buildingName: string;            // 建物名称 (D列)
  buildingNameKana: string;        // 建物名称カナ（半角） (E列)
  postalCode: string;              // 郵便番号 (F列)
  buildingAddress: string;         // 建物住所 (G列)
  constructionCompany: string;     // 建設会社 (H列)
  constructionCompanyContact: string; // 連絡先 (I列)
  designOffice: string;            // 設計事務所 (J列)
  designOfficeContact: string;     // 連絡先 (K列)
  sashVendor: string;              // サッシ業者 (L列)
  sashVendorContact: string;       // 連絡先 (M列)
  ownerName: string;               // 施主 (N列)
  ownerContact: string;            // 連絡先 (O列)
  siteRemarks: string;             // 備考 (P列)
  siteInputBy: string;             // 入力者 (Q列)
  buildingUse: string;             // 建物用途(名前） (BT列)

  // --- 自主検査書 連絡事項 ---
  contactNotes: string;

  // --- 各扉データ ---
  doors: SelfInspectionDoorRecord[];

  createdAt: string;
  updatedAt: string;
  updatedByName?: string;
}
