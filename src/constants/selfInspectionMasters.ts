import {
  InventoryAutoMatchRule,
  SelfInspectionCheckCategoryDef,
  SelfInspectionCheckItemDef,
  SelfInspectionJudgementOption,
  SelfInspectionOfficeConfig,
} from '../types/selfInspection';

// ============================================================
// 部品・選択肢マスター一覧（PDF 3 部品一覧に完全準拠）
// ============================================================

export const MOTOR_MASTERS: string[] = [
  'T60KNB', 'P60KNB', '80KNB', '70KLCM', '100KLCM', '160KLCM', '200KLCM', '250KLCM',
  '200KDCN', '300KDCN', '400KDCN', '600KDCN', '60KLTM', '150KLTM', '70KLDM', '100KLDM',
  '160KLDM', '200KLDM', '200KNB', '200KDC', 'F300KDC', '400KDC', '600KDC', 'HOH-SD',
  'HOH-DD', 'HB-BB', 'HOG-900', 'HOH-1000', 'HOG-1100', 'HB-1100', 'SH-15TC', 'SH-23TC',
  'SH-15KC', 'SH-23KC', 'SH-15TF（150TS)', 'SH-17H', 'SH-09TF', 'P60KNB-5', '17H2DL',
  'SH-09', 'SH-23H', 'SH-23', '09TF', '300KLCM', 'SH-90TF', 'SH-70T', 'リニア',
  'SH-17TF', 'HB-2000', 'HB-002', 'SH-17', '17H', '17HDL', '70KLCM-2',
];

export const CB_MASTERS: string[] = [
  'DUC-', 'DCR-5P', 'DCU-', 'DRH-3', 'DCH-', 'RCC-', 'RCU-', 'MTU-', '6TU-', 'F1',
  'F2', 'F3', 'HOG-', 'HOH-FD', 'EL・IL', 'IL・D', 'J', 'L', 'LC1', 'SP1', 'MC6',
  'HM-15K', 'HM-23K', 'HM-06K', 'HP-17X', 'SH-9TF', 'HP-23H2', 'HP-17H2-17HDL',
  '74900-', 'YCB-', 'ORH-3SWG', 'HP-23H2-23HDL', 'SH-17', 'DRH3-N-Hla-H3a-IL-lF',
  '17H2', '17HDL', '17H', 'DCR-5P ELIL', 'DCR-N1',
];

export const ELECTRIC_LOCK_MASTERS: string[] = [
  '無', 'EL-6S', 'EL-7SN2', 'EL-6RM', 'EL-7RN', 'BPM-11', 'BPM-25C', 'EC-1',
  'EL-R/S-N', 'EL-R/S-3', 'BP-C10', 'ELM1', 'ELC-01', 'ELC-03', 'ELC-05', 'MP',
  'ELM1-24', 'EL-7SN2C-L', 'ELM-24', 'EC-1A', 'ELM-05', 'EL-7SN2C-R', 'リニア用',
  'ELC-05A', 'BPM-10C3', 'EL-7SNV2-LR', '電ブレ', 'EL-RS3', 'EL-7SNV', 'ELM-1-90-TD',
  'EL-7SNV2-R', 'EL-7SNV2-L', 'EL7SN2CN', 'EL-24', 'ELM-24-1', 'EL-7SN2C-1',
  'EL-7SN2C', 'ELM1 ELC-05',
];

export const SENSOR_MASTERS: string[] = [
  'OA-215V', 'OA-220V', 'OA-203V', 'OA-205V', 'OA-204V', 'OA-224V', 'OA-214V', 'OA-72V',
  'OAT-3V', 'OA-220V BUILTIN', 'HW-40T/4S', 'HA-T520', 'HA-430', 'HA-400', 'アルコール噴霧器',
  'OW-503T', '押しボタン', '消毒機連動', 'HW-500T', 'OA-6000S', 'OA-4700S', 'FS-10P',
  'OW-503S', 'OW-503TM', 'OAW-1T', 'HW-300R', 'タッチ', 'HA-260', 'マジック', '手',
  'ハンド', 'OAH-100K', 'OS-10P（ビームタッチ）', 'OAT-3VBUILTIN', 'HW-500S', 'OA-203B',
  'OA-203VBUILTIN', 'ナブコタッチスイッチ', '集合玄関機', '開閉停ボタン', '多目的トイレドアSW',
  'HW-2R', 'カードリーダー', 'OS-20P', 'ループコイル', 'PHPボタン', 'OS-20P（ビームタッチ）',
  'ECE1706KPﾊﾟﾅｿﾆｯｸ製（省電力型ﾜｲﾔﾚｽｺｰﾙﾍﾟﾝﾀﾞﾝﾄ発信器）', 'テンキー', 'OW-300R', 'HW-40T',
  'HW-500T×1/HW-300R×1', 'HW-500S×2', 'HW-500T×2/HW-300R×1', 'OA-225V', 'HA-520×2',
  '生体認証', '手(OAH-1000)', '手洗い', 'OAW-1V', 'OW-500', 'インターホン', 'スワンJ',
  'MFS-1', '下取付3V', '消毒器', 'カードキー', 'HW-500T×2', 'VVS-1', '全開 FS-03P',
  '半開 OAH-100K', 'OA-215V×2', '楽王（リモコン）', 'スート', 'ビルトイン', 'HA-520×3',
  'タッチパネル', 'なし', 'OA-720V', '多目的押しボタン', 'HW-500T or テンキー',
  'OW-503T、503R', 'OAT-3CAN', 'OA-720CAN', 'OA-220BUILTIN CAN',
];

export const SUB_SENSOR_MASTERS: string[] = [
  '無', 'OS-10P', 'OS-20P', 'HZ-C/1', 'DS-6N', 'P-2209', 'PB-20TE', 'OS-20PR',
  'OS-15', 'MAモーション', 'OS-10PR', 'OS-10P+OS-20P', 'OS-10CAN',
];

export const ROLLER_MASTERS: string[] = [
  'H1戸車', 'H1戸車（硬質）', 'M3用1ヶ戸車', 'M3用ガイド車', 'M3戸車セット', 'M3戸車セット調整付',
  '60φ戸車', '60φ戸車(硬質）', 'D3用1ヶ戸車（MD用）', 'LTM戸車セット', '44φ戸車',
  '44φ戸車（硬質）', 'TFM戸車', 'TFM戸車（硬質）', 'フルオープナー戸車', '円形用戸車',
  '80φ戸車', '80φ戸車（硬質）', '35Nダブルローラー', '45Eダブルローラー', '45Eローラー',
  'TAS戸車', 'LWハンガー', 'フジパスカル戸車', 'カベ納まり用W戸車', '防音扉用戸車',
  'RS戸車', 'ダブルスライド用戸車', 'MDSM3戸車', 'コクヨ戸車', '防火戸車', 'D100吊車',
  'φ100鉄輪（F型・スチール）', 'T2戸車', '上框穏蔽', '4ヶ戸車', 'D3用2ヶ戸車（MD用）',
  'DDS戸車', '防火4ヶ戸車', 'MWダブルローラー', 'WRS戸車', 'MDS戸車', 'MDSH1戸車',
  '特', 'LW用戸車', 'D100用', '戸袋納まり', '70φ戸車', 'LH用W戸車', 'HD戸車', 'LH-RS',
  'M2戸車', 'H1ダブル戸車', 'M3W戸車', 'JSP用引寄せハンガー', '60φW戸車', 'シャトルドア用戸車',
  'HB戸車', 'D3用1ヶ戸車', 'M3用4ヶ戸車', 'G型戸車', 'LH用戸車', 'P2戸車', 'D3用2ヶ戸車',
  'K1戸車', '床下用戸車', 'ダブルスライド直付戸車', '引寄せハンガー', 'LW引寄せ',
  'LW用W戸車', 'HW戸車', 'F型', 'BC TAS用戸車', 'D100戸車', 'MD戸車',
  'W戸車(壁納まり用）', 'ダブルS戸車', 'TAS戸車（WS)', 'M4',
];

export const BELT_MASTERS: string[] = [
  'Vベルト', 'A', 'B', 'タイミングベルト', 'チェーン', 'ワイヤー',
];

export const BASEPLATE_MASTERS: string[] = [
  'M3台板', 'H1台板', 'D3台板', 'LHレール', 'LLレール', '円形用レール', 'EB', 'BC',
  'Wスライド台板(H1)', 'フルミニ', 'LWレール', 'フジパスカルレール', 'カベ納用',
  'リニアレール', 'EB TAS(100見込み)', 'P60K用台板', 'D3B', 'MDSH1', 'M2台板',
  'MDSM3台板', 'ダブルスライド用台板', 'BC TAS台板（直づけ）', 'コクヨレール', 'D100台板',
  'TFM台板', 'ステンレスレール', 'T2台板', 'Wスライド台板（M3)', 'YKK上框穏蔽', 'DDS台板',
  'HD台板', '戸袋納まり', 'MW', '小松納まり', 'WRS台板', 'B台板', '磨き鋼レール（鉄）',
  'HWレール', 'HDレール', '70見込み', 'シャトルドアレール', 'HB台板', 'P2台板',
  'スチールレール', 'K1台板', '特レール', '床下用台板', 'ダブルスライド直付台板',
  'TASレール', 'F型', '壁内蔵型レール', 'CN-TAS台板（2連引）', 'BC TAS（直付）',
  'TAS Wスライド台板', 'A台板', '内蔵', 'M4', 'D3A',
];

export const MATERIAL_MASTERS: string[] = [
  'アルミ', 'スチール', 'ステンレス', '軽量スチール', '木', 'フラッシュ',
];

export const DOOR_TYPE_MASTERS: { code: string; label: string }[] = [
  { code: '1', label: '1.框' },
  { code: '2', label: '2.強化ガラス' },
  { code: '3', label: '3.フラッシュ' },
  { code: '4', label: '4.格子' },
  { code: '5', label: '5.その他' },
];

export const OPENING_METHOD_MASTERS: string[] = [
  '両引', '片引', '二連両引', '二連片引', '円形両引', '円形片引', '四枚折戸', '二枚折戸',
  'フルオープン', '折れ戸', 'TFM-D', 'TFM-S', 'TF-D', 'TF-S', '開き戸',
  'スライド門扉', 'スイング門扉', '回転ドア', '3連片引き', 'スライドプッシュ',
];

export const EG_MOUNT_MASTERS: string[] = [
  '無目', '天井', '直付', '床埋', '床置', '戸袋内蔵',
];

export const GLASS_MASTERS: string[] = [
  '普通', '強化', '網入', '耐熱', 'スリムセナージⅡ CAS', 'ピラン6.5mm防設', '複層', '無',
];

export const FIRE_EQUIPMENT_MASTERS: string[] = [
  '無', '乙防', '防火', '特防', '有',
];

export const YES_NO_MASTERS: string[] = [
  '有', '無', '未定',
];

export const STICKER_MASTERS: string[] = [
  '有', '無', '有（サイン工事）',
];

export const POWER_SWITCH_MASTERS: { code: string; label: string; crmVal: string }[] = [
  { code: '1', label: '1.内観左', crmVal: '内観左' },
  { code: '2', label: '2.中央', crmVal: '中央' },
  { code: '3', label: '3.内観右', crmVal: '内観右' },
];

export const FIRE_ALARM_SIGNAL_OPTIONS: string[] = [
  '無', '1.オープン', '2.クローズ',
];

export const BUILDING_USE_MASTERS: string[] = [
  '共同住宅', '個人住宅', '店舗', '飲食店', '百貨店', 'スーパー', '商業施設',
  'レクリエーション施設', '事務所', '宿泊施設', '病院・医療施設', '福祉・介護施設',
  '工場', '官公庁舎', '官公庁管理施設', '学校', '銀行・金融機関', '郵便局',
  '駅舎', '公共施設', 'その他',
];

// ============================================================
// 自主検査書 標準様式（PDF 1 に完全準拠）
// ============================================================

export const DEFAULT_JUDGEMENT_OPTIONS: SelfInspectionJudgementOption[] = [
  { code: '○', label: '良好 / 適合', tone: 'emerald' },
  { code: '×', label: '不適合', tone: 'rose' },
  { code: '－', label: '該当無', tone: 'slate' },
  { code: 'レ', label: '確認済', tone: 'indigo' },
  { code: '△', label: '要調整', tone: 'amber' },
];

export const DEFAULT_SELF_INSPECTION_CATEGORIES: SelfInspectionCheckCategoryDef[] = [
  { id: 'power', name: '電源・配線', order: 1 },
  { id: 'door', name: '扉関係', order: 2 },
  { id: 'sensor_outer', name: '起動センサー（外側）', order: 3 },
  { id: 'sensor_inner', name: '起動センサー（内側・安全光線）', order: 4 },
  { id: 'special', name: '特殊仕様', order: 5 },
  { id: 'overall', name: '総合動作', order: 6 },
  { id: 'safety', name: '安全', order: 7 },
];

export const DEFAULT_SELF_INSPECTION_CHECK_ITEMS: SelfInspectionCheckItemDef[] = [
  // 電源・配線
  { key: 'power_wired', label: '結線されているか', category: 'power', inputType: 'judgement', defaultVal: '○', order: 1, isActive: true, showInPrint: true },
  { key: 'emergency_power_check', label: '非常電源の設置と作動の確認を行ったか', category: 'power', inputType: 'judgement', defaultVal: '－', order: 2, isActive: true, showInPrint: true },
  { key: 'power_unit_check', label: '電源ユニットの有無と作動の確認を行ったか', category: 'power', inputType: 'judgement', defaultVal: '－', order: 3, isActive: true, showInPrint: true },
  { key: 'wire_connector_fix', label: '配線の固定は確実か・コネクター接続は確実か', category: 'power', inputType: 'judgement', defaultVal: '○', order: 4, isActive: true, showInPrint: true },

  // 扉関係
  { key: 'belt_rail_parallel', label: 'ベルトラインと上レールの平行度が保たれていること', category: 'door', inputType: 'judgement', defaultVal: '○', order: 1, isActive: true, showInPrint: true },
  { key: 'derailment_stopper', label: '脱線防止・ストッパーがしっかりと固定されているか', category: 'door', inputType: 'judgement', defaultVal: '○', order: 2, isActive: true, showInPrint: true },
  { key: 'jamb_mullion_parallel', label: '戸当り・中方立との平行度が保たれていること', category: 'door', inputType: 'judgement', defaultVal: '○', order: 3, isActive: true, showInPrint: true },
  { key: 'bottom_rail_gap', label: '扉下部とレールの隙間は5〜10mmの範囲に納まっている', category: 'door', inputType: 'judgement', defaultVal: '○', order: 4, isActive: true, showInPrint: true },
  { key: 'full_open_gap_30mm', label: '全開時に扉の建て枠と中方立の間に30mm以上の隙間がある', category: 'door', inputType: 'judgement', defaultVal: '○', order: 5, isActive: true, showInPrint: true },

  // 起動センサー（外側）
  { key: 'outer_area_right', label: '①エリア余裕幅（有効開口＋150mm以上）右側', subGroup: '外側', category: 'sensor_outer', inputType: 'judgement', defaultVal: '○', order: 1, isActive: true, showInPrint: true },
  { key: 'outer_area_left', label: '②エリア余裕幅（有効開口＋150mm以上）左側', subGroup: '外側', category: 'sensor_outer', inputType: 'judgement', defaultVal: '○', order: 2, isActive: true, showInPrint: true },
  { key: 'outer_depth', label: '③奥行き（ドア芯から1000mm以上）', subGroup: '外側', category: 'sensor_outer', inputType: 'judgement', defaultVal: '○', order: 3, isActive: true, showInPrint: true },
  { key: 'outer_dead_zone', label: '④不感知帯（補助光電センサーより150mm以内）', subGroup: '外側', category: 'sensor_outer', inputType: 'judgement', defaultVal: '○', order: 4, isActive: true, showInPrint: true },

  // 起動センサー（内側・安全光線）
  { key: 'inner_area_right', label: '①エリア余裕幅（有効開口＋150mm以上）右側', subGroup: '内側', category: 'sensor_inner', inputType: 'judgement', defaultVal: '○', order: 1, isActive: true, showInPrint: true },
  { key: 'inner_area_left', label: '②エリア余裕幅（有効開口＋150mm以上）左側', subGroup: '内側', category: 'sensor_inner', inputType: 'judgement', defaultVal: '○', order: 2, isActive: true, showInPrint: true },
  { key: 'inner_depth', label: '③奥行き（ドア芯から1000mm以上）', subGroup: '内側', category: 'sensor_inner', inputType: 'judgement', defaultVal: '○', order: 3, isActive: true, showInPrint: true },
  { key: 'inner_dead_zone', label: '④不感知帯（補助光電センサーより150mm以内）', subGroup: '内側', category: 'sensor_inner', inputType: 'judgement', defaultVal: '○', order: 4, isActive: true, showInPrint: true },
  { key: 'beam_optical_axis', label: '安全光線は光軸が一致し、作動する', category: 'sensor_inner', inputType: 'judgement', defaultVal: '○', order: 5, isActive: true, showInPrint: true },

  // 特殊仕様
  { key: 'electric_lock_check', label: '電気錠：確実に受け金具に掛かる', category: 'special', inputType: 'judgement', defaultVal: '－', order: 1, isActive: true, showInPrint: true },
  { key: 'fire_interlock_wiring', label: '火報信号,開閉信号,インターロック等の結線と作動確認', category: 'special', inputType: 'judgement', defaultVal: '－', order: 2, isActive: true, showInPrint: true },
  { key: 'signal_tx_rx', label: '信号の送受信が確実に実行されている', category: 'special', inputType: 'judgement', defaultVal: '－', order: 3, isActive: true, showInPrint: true },

  // 総合動作
  { key: 'overall_operation', label: '総合動作（通常開閉動作・反転動作）', category: 'overall', inputType: 'judgement', defaultVal: '○', order: 1, isActive: true, showInPrint: true },
  { key: 'retighten_all', label: '増し締めすること', category: 'overall', inputType: 'judgement', defaultVal: '○', order: 2, isActive: true, showInPrint: true },

  // 安全
  { key: 'stickers_applied', label: '注意・ドア・サービスの各ステッカーが貼られているか', category: 'safety', inputType: 'judgement', defaultVal: '○', order: 1, isActive: true, showInPrint: true },
];

export const DEFAULT_AUTO_MATCH_RULES: InventoryAutoMatchRule[] = [
  {
    id: 'rule-open-both',
    name: '両引き自動判定',
    keywords: ['両引', '両引き'],
    matchMode: 'any',
    targetField: 'openingMethod',
    targetValue: '両引',
    enabled: true,
    description: '品名に「両引」が含まれる場合、開閉方式を「両引」に設定',
  },
  {
    id: 'rule-open-single',
    name: '片引き自動判定',
    keywords: ['片引', '片引き'],
    matchMode: 'any',
    targetField: 'openingMethod',
    targetValue: '片引',
    enabled: true,
    description: '品名に「片引」が含まれる場合、開閉方式を「片引」に設定',
  },
  {
    id: 'rule-open-double-slide',
    name: '二連片引自動判定',
    keywords: ['2連引', '二連引', '2連片引', '二連片引', 'Wスライド'],
    matchMode: 'any',
    targetField: 'openingMethod',
    targetValue: '二連片引',
    enabled: true,
    description: '品名に「2連引」「Wスライド」等が含まれる場合、開閉方式を「二連片引」に設定',
  },
  {
    id: 'rule-mount-mume',
    name: '無目内蔵自動判定',
    keywords: ['無目', 'CN'],
    matchMode: 'any',
    targetField: 'mountMethod',
    targetValue: '無目',
    enabled: true,
    description: '品名に「無目」または「CN」が含まれる場合、EG納まりを「無目」に設定',
  },
  {
    id: 'rule-mount-ceiling',
    name: '天井内取付自動判定',
    keywords: ['天井'],
    matchMode: 'any',
    targetField: 'mountMethod',
    targetValue: '天井',
    enabled: true,
    description: '品名に「天井」が含まれる場合、EG納まりを「天井」に設定',
  },
  {
    id: 'rule-mount-direct',
    name: '直付自動判定',
    keywords: ['直付', '直づけ'],
    matchMode: 'any',
    targetField: 'mountMethod',
    targetValue: '直付',
    enabled: true,
    description: '品名に「直付」が含まれる場合、EG納まりを「直付」に設定',
  },
  {
    id: 'rule-emergency-power',
    name: '非常電源あり自動ON',
    keywords: ['非常電源', 'バッテリー', 'ﾊﾞｯﾃﾘ'],
    matchMode: 'any',
    targetField: 'emergencyPower',
    targetValue: '有',
    enabled: true,
    description: '品名に「非常電源」「バッテリー」が含まれる場合、非常電源を「有」に設定',
  },
  {
    id: 'rule-emergency-check',
    name: '非常電源チェック項目ON',
    keywords: ['非常電源', 'バッテリー', 'ﾊﾞｯﾃﾘ'],
    matchMode: 'any',
    targetField: 'checkItem',
    targetCheckKey: 'emergency_power_check',
    targetValue: '○',
    enabled: true,
    description: '非常電源関連部品がある場合、自主検査書の非常電源チェック欄を初期「○」に設定',
  },
  {
    id: 'rule-fire-equipment',
    name: '防火設備自動ON',
    keywords: ['防火', '乙防', '特防', 'F型'],
    matchMode: 'any',
    targetField: 'fireProtectionEquipment',
    targetValue: '防火',
    enabled: true,
    description: '品名に「防火」「乙防」「特防」が含まれる場合、防火設備を「防火」に設定',
  },
  {
    id: 'rule-electric-lock-check',
    name: '電気錠チェック項目ON',
    keywords: ['電気錠', 'EL-', 'ELM', 'BPM-'],
    matchMode: 'any',
    targetField: 'checkItem',
    targetCheckKey: 'electric_lock_check',
    targetValue: '○',
    enabled: true,
    description: '電気錠関連部品がある場合、自主検査書の電気錠チェック欄を初期「○」に設定',
  },
];

export function createDefaultSelfInspectionOfficeConfig(
  officeId: string = 'default',
  officeName: string = '全社共通（デフォルト）',
  officeCode?: string
): SelfInspectionOfficeConfig {
  return {
    officeId,
    officeCode,
    officeName,
    useCustomConfig: officeId === 'default',
    categories: DEFAULT_SELF_INSPECTION_CATEGORIES.map((c) => ({ ...c })),
    checkItems: DEFAULT_SELF_INSPECTION_CHECK_ITEMS.map((item) => ({ ...item })),
    judgementOptions: DEFAULT_JUDGEMENT_OPTIONS.map((j) => ({ ...j })),
    autoMatchRules: DEFAULT_AUTO_MATCH_RULES.map((r) => ({ ...r, keywords: [...r.keywords] })),
  };
}

/** 自主検査書印刷用の開閉方式番号変換 */
export function formatOpeningMethodForPrint(val?: string): string {
  if (!val) return '';
  const s = val.trim();
  if (/^[1-5]\./.test(s)) return s;
  if (s.includes('片引') && !s.includes('二連') && !s.includes('2連')) return '1.片引き';
  if (s.includes('両引') && !s.includes('二連') && !s.includes('2連')) return '2.両引き';
  if (s.includes('二連') || s.includes('2連') || s.includes('3連')) return '3.２連引き';
  if (s.includes('フルオープン')) return '4.フルオープン';
  if (s.includes('折れ戸') || s.includes('折戸')) return '5.折れ戸';
  return s;
}

/** 自主検査書印刷用の取付方法番号変換 */
export function formatMountMethodForPrint(val?: string): string {
  if (!val) return '';
  const s = val.trim();
  if (/^[1-4]\./.test(s)) return s;
  if (s.includes('無目')) return '1.無目内蔵';
  if (s.includes('天井')) return '2.天井内取付';
  if (s.includes('直付')) return '3.直付け';
  if (s.includes('床埋') || s.includes('地下')) return '4.地下埋設';
  return s;
}

/** 自主検査書印刷用の電源スイッチ位置番号変換 */
export function formatPowerSwitchForPrint(val?: string): string {
  if (!val) return '';
  const s = val.trim();
  if (/^[1-3]\./.test(s)) return s;
  if (s.includes('左')) return '1.内観左';
  if (s.includes('中央')) return '2.中央';
  if (s.includes('右')) return '3.内観右';
  return s;
}

/** CRM出力用の72列（A〜BT）完全ヘッダー定義（AW列・BP列は元表準拠の空白列） */
export const CRM_EXCEL_HEADERS_72: string[] = [
  '管理番号',             // A (1)
  '契約先',               // B (2)
  '工事名称',             // C (3)
  '建物名称',             // D (4)
  '建物名称カナ（半角）',  // E (5)
  '郵便番号',             // F (6)
  '建物住所',             // G (7)
  '建設会社',             // H (8)
  '連絡先',               // I (9)
  '設計事務所',           // J (10)
  '連絡先',               // K (11)
  'サッシ業者',           // L (12)
  '連絡先',               // M (13)
  '施主',                 // N (14)
  '連絡先',               // O (15)
  '備考',                 // P (16)
  '入力者',               // Q (17)
  '現場コード',           // R (18)
  '建具符号',             // S (19)
  '設置場所',             // T (20)
  '設置場所カナ（半角）',  // U (21)
  '建具材質',             // V (22)
  'メーカー',             // W (23)
  '開閉方式',             // X (24)
  'EG納まり',             // Y (25)
  '台板寸法',             // Z (26)
  'コーナーブラケット',    // AA (27)
  '扉重量',               // AB (28)
  '扉サイズH',            // AC (29)
  '扉サイズW',            // AD (30)
  'HP寸法',               // AE (31)
  'ガラス',               // AF (32)
  '火報信号',             // AG (33)
  '防火区画',             // AH (34)
  '防火設備',             // AI (35)
  '非常電源',             // AJ (36)
  '図面番号',             // AK (37)
  '備考',                 // AL (38)
  '入力者',               // AM (39)
  '電源SW',               // AN (40)
  '壁SW',                 // AO (41)
  '連絡先ステッカー',      // AP (42)
  '注意ステッカー',        // AQ (43)
  '防護柵',               // AR (44)
  'モーター',             // AS (45)
  '製造№',                // AT (46)
  '取付日',               // AU (47)
  'CB（改造）',           // AV (48)
  '',                     // AW (49) 元表の空白列
  '製造№',                // AX (50)
  '取付日',               // AY (51)
  '電気錠　本体',          // AZ (52)
  'ロット番号',           // BA (53)
  '電気錠　CB',           // BB (54)
  'ロット番号',           // BC (55)
  'センサー　外　起動',    // BD (56)
  'ロット番号',           // BE (57)
  'センサー　外　補助',    // BF (58)
  'ロット番号',           // BG (59)
  'センサー　内　起動',    // BH (60)
  'ロット番号',           // BI (61)
  'センサー　内　補助',    // BJ (62)
  'ロット番号',           // BK (63)
  'センサー　補助',        // BL (64)
  'ロット番号',           // BM (65)
  '戸車',                 // BN (66)
  'ベルト',               // BO (67)
  '',                     // BP (68) 元表の空白列
  '台板',                 // BQ (69)
  '備考',                 // BR (70)
  '工事入力者',           // BS (71)
  '建物用途(名前）',       // BT (72)
];
