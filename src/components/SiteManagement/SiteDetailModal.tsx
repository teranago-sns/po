import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Layers, Calendar, User as UserIcon, Building, MapPin, 
  ExternalLink, MessageSquare, Send, CheckCircle2, Clock, 
  FileText, Paperclip, Trash2, Edit3, Save, RefreshCw, AlertCircle, FileSpreadsheet, Download, Eye, HardHat,
  Camera, Upload, UploadCloud, Image as ImageIcon, Loader2, Database, Search, LayoutDashboard, Plus,
  ChevronDown, ChevronRight
} from 'lucide-react';
import { Site, SiteMainPart, SiteSubPart, SiteComment, SiteStatus, PartStatus, SiteAttachment, ExternalSiteLookupResult } from '../../types/site';
import { User, AttachmentFile, CalendarEvent, OfficeMaster, DivisionMaster } from '../../types';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';
import { triggerOpenUserModal } from '../../utils/userModal';
import { API_BASE_URL, appendAuthTokenToUrl } from '../../config/api';
import { FilePreviewModal } from '../FilePreviewModal';
import { ConfirmModal, ConfirmModalState } from '../ConfirmModal';
import { EventModal } from '../EventModal';
import { RecurrenceActionScope } from '../RecurrenceActionModal';
import { getFittingLabel, cleanPartName, expandExternalSitePayload, mergeInventorySyncWithSite, deriveInventoryPartStatus, normalizeExternalDate, groupSubPartsByFitting, normalizeFittingKey, SubPartFittingGroup } from '../../utils/siteUtils';
import { uploadFile, resolveFileUrl } from '../../utils/fileUpload';
import { SiteDashboardTab } from './SiteDashboardTab';
import { SiteSelfInspectionTab } from './SiteSelfInspectionTab';

interface SiteDetailModalProps {
  site: Site | null;
  sites?: Site[];
  isOpen: boolean;
  onClose: () => void;
  onUpdateSite: (updatedSite: Site) => void;
  onDeleteSite: (siteId: string) => void;
  currentUser: User;
  allUsers: User[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  events?: CalendarEvent[];
  onNavigateToCalendar?: (eventId: string, date?: string, targetUser?: User) => void;
  onAddEvent?: (eventData: Omit<CalendarEvent, 'id'>) => Promise<void> | void;
  onUpdateEvent?: (updatedEvent: CalendarEvent, scope?: RecurrenceActionScope, originalInstanceDate?: string) => Promise<void> | void;
  onDeleteEvent?: (eventId: string, scope?: RecurrenceActionScope, instanceDate?: string) => Promise<void> | void;
}

/**
 * Windows UNCパス (\volume1\Teraoka-Sekkei\share\02-施工図PDF\現場A\平面図.pdf 等) や Z:\share\02-施工図PDF\現場A\平面図.pdf
 * から 02-施工図PDF 内の相対パス (例: 現場A/平面図.pdf) を自動補正するヘルパー
 */
export function normalizeDrawingPath(rawPath?: string, siteName?: string): string {
  if (!rawPath) return '';
  let cleaned = rawPath.trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/');
  
  cleaned = cleaned.replace(/^(?:\\\\|\/\/)[^\/]+\/(?:Teraoka-Sekkei\/)?(?:share\/)?02-施工図PDF\/?/i, '');
  cleaned = cleaned.replace(/^(?:\\\\|\/\/)[^\/]+\/[^\/]+\/02-施工図PDF\/?/i, '');
  cleaned = cleaned.replace(/^(?:\/|\\\\)volume1\/Teraoka-Sekkei\/share\/02-施工図PDF\/?/i, '');
  cleaned = cleaned.replace(/^[a-zA-Z]:\/(?:02-施工図PDF\/)?/i, '');
  cleaned = cleaned.replace(/^\/?02-施工図PDF\//i, '');
  cleaned = cleaned.replace(/^\/+/g, '');

  return cleaned;
}

/**
 * 施工図PDFファイル登録のフォーマット・所定フォルダバリデーション
 */
export async function validateAndResolveDrawingPath(rawInput: string): Promise<{
  valid: boolean;
  resolvedPath?: string;
  error?: string;
}> {
  if (!rawInput || !rawInput.trim()) {
    return { valid: false, error: 'ファイルパスが空です。' };
  }

  const trimmed = rawInput.trim().replace(/^["']|["']$/g, '');
  const normalizedSlashes = trimmed.replace(/\\/g, '/');
  const fileName = normalizedSlashes.split('/').pop() || trimmed;

  // ① 拡張子チェック (PDF以外は即座に拒否)
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext !== 'pdf') {
    return {
      valid: false,
      error: `【登録エラー】施工図はPDF形式（.pdf）のファイルのみ登録可能です。[対象: ${fileName}]`
    };
  }

  // ② 所定のフォルダ (02-施工図PDF) チェック
  const isWinAbsolutePath = /^(?:\\\\|\/\/|[a-zA-Z]:\/)/i.test(normalizedSlashes);
  if (isWinAbsolutePath && !/02-施工図PDF/i.test(normalizedSlashes)) {
    return {
      valid: false,
      error: `【登録エラー】所定のフォルダ（02-施工図PDF）以外のファイルは登録できません。[対象: ${fileName}]`
    };
  }

  // ③ サーバーでのパス検証 API 呼び出し
  try {
    const res = await fetch(`${API_BASE_URL}/sites/drawings/validate?path=${encodeURIComponent(trimmed)}`);
    const json = await res.json();
    if (res.ok && json.success && json.valid && json.resolvedPath) {
      return {
        valid: true,
        resolvedPath: json.resolvedPath
      };
    } else {
      return {
        valid: false,
        error: json.error || `【登録エラー】所定のフォルダ（02-施工図PDF）内に指定されたファイルが見つかりません。[対象: ${fileName}]`
      };
    }
  } catch (_) {
    const norm = normalizeDrawingPath(trimmed);
    if (!norm) {
      return {
        valid: false,
        error: `【登録エラー】有効な施工図パスを指定してください。[対象: ${fileName}]`
      };
    }
    return {
      valid: true,
      resolvedPath: norm
    };
  }
}

export function getSiteDrawingList(site?: Site | null): string[] {
  if (!site) return [];
  if (Array.isArray(site.drawings) && site.drawings.length > 0) {
    return site.drawings.map(d => normalizeDrawingPath(d)).filter(Boolean);
  }
  if (site.drawingUrl) {
    const raw = site.drawingUrl.trim();
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((d: string) => normalizeDrawingPath(d)).filter(Boolean);
      } catch (_) {}
    }
    const norm = normalizeDrawingPath(raw);
    return norm ? [norm] : [];
  }
  return [];
}

export const SiteDetailModal: React.FC<SiteDetailModalProps> = ({
  site,
  sites = [],
  isOpen,
  onClose,
  onUpdateSite,
  onDeleteSite,
  currentUser,
  allUsers,
  offices = [],
  divisions = [],
  events,
  onNavigateToCalendar,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
}) => {
  const [activeTab, setActiveTab] = useState<'parts' | 'timeline' | 'schedule' | 'info' | 'export'>('info');
  const [fetchedEvents, setFetchedEvents] = useState<CalendarEvent[]>([]);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingScheduleEvent, setEditingScheduleEvent] = useState<CalendarEvent | null>(null);

  // 親から events が渡されていない場合は自動取得
  useEffect(() => {
    if (events && events.length > 0) return;
    let isMounted = true;
    fetch(`${API_BASE_URL}/events?all=true`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!isMounted || !data) return;
        if (Array.isArray(data)) {
          setFetchedEvents(data);
        } else if (Array.isArray(data.events)) {
          setFetchedEvents(data.events);
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [events]);

  // 編集用ローカルステート
  const [currentSite, setCurrentSite] = useState<Site | null>(site);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });

  // 該当現場に紐づく施工スケジュール・実績を抽出
  const siteEvents = useMemo(() => {
    const allEvts = (events && events.length > 0) ? events : fetchedEvents;
    if (!currentSite) return [];
    const siteCodeNorm = (currentSite.siteCode || '').trim().toLowerCase();
    const siteNameNorm = (currentSite.siteName || '').trim();

    return allEvts.filter(e => {
      // 1. siteId で完全一致
      if (e.siteId && e.siteId === currentSite.id) return true;
      // 2. siteCode で完全一致
      if (e.siteCode && siteCodeNorm && e.siteCode.trim().toLowerCase() === siteCodeNorm) return true;
      // 3. 工事タイプでタイトル内に現場コードや現場名が含まれる場合
      if (e.type === 'construction') {
        if (siteCodeNorm && e.title.toLowerCase().includes(siteCodeNorm)) return true;
        if (siteNameNorm && e.title.includes(siteNameNorm)) return true;
      }
      return false;
    }).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [events, fetchedEvents, currentSite]);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drawingErrorModal, setDrawingErrorModal] = useState<string | null>(null);

  // コメント入力
  const [commentInput, setCommentInput] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // ファイルプレビュー用ステート
  const [previewFile, setPreviewFile] = useState<AttachmentFile | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDragOverDrawing, setIsDragOverDrawing] = useState(false);

  // 付属部品の外部在庫DBリアルタイム取得・入出庫ステータス監視
  const [subParts, setSubParts] = useState<SiteSubPart[]>(site?.subPartsCache || []);
  const [isLoadingSubParts, setIsLoadingSubParts] = useState(false);
  const [expandedSubPartGroups, setExpandedSubPartGroups] = useState<Record<string, boolean>>({});
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<{
    type: 'success' | 'info' | 'warning';
    message: string;
    timestamp: string;
  } | null>(null);

  const subPartGroups = useMemo(
    () => groupSubPartsByFitting(subParts, currentSite?.mainParts || []),
    [subParts, currentSite?.mainParts]
  );

  const matchedSubPartGroups = useMemo(
    () => subPartGroups.filter((g) => g.matchedMainPart),
    [subPartGroups]
  );

  const unmatchedSubPartGroups = useMemo(
    () => subPartGroups.filter((g) => !g.matchedMainPart),
    [subPartGroups]
  );

  const unmatchedSubPartsTotalCount = useMemo(
    () => unmatchedSubPartGroups.reduce((sum, g) => sum + g.counts.total, 0),
    [unmatchedSubPartGroups]
  );

  // 各主要部品インデックスに紐づく付属部品グループ（同一建具符号が複数台ある場合は先頭行に1回だけ紐づけ）
  const mainPartSubGroupByIdx = useMemo(() => {
    const map = new Map<number, SubPartFittingGroup>();
    const mainPartsList = currentSite?.mainParts || [];
    const byKey = new Map(matchedSubPartGroups.map((g) => [g.key, g]));
    const assignedKeys = new Set<string>();
    mainPartsList.forEach((mp, idx) => {
      const rawFit = String(mp.fittingNo || '').trim() || getFittingLabel(mp, idx, currentSite?.egCount || mainPartsList.length);
      const key = normalizeFittingKey(rawFit);
      if (key && byKey.has(key) && !assignedKeys.has(key)) {
        assignedKeys.add(key);
        map.set(idx, byKey.get(key)!);
      }
    });
    return map;
  }, [currentSite?.mainParts, currentSite?.egCount, matchedSubPartGroups]);

  const allMatchedSubGroupsExpanded =
    matchedSubPartGroups.length > 0 && matchedSubPartGroups.every((g) => Boolean(expandedSubPartGroups[g.key]));

  const allUnmatchedSubGroupsExpanded =
    unmatchedSubPartGroups.length > 0 && unmatchedSubPartGroups.every((g) => Boolean(expandedSubPartGroups[g.key]));

  const toggleSubPartGroup = (groupKey: string) => {
    setExpandedSubPartGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const handleToggleAllMatchedSubPartGroups = () => {
    setExpandedSubPartGroups((prev) => {
      const next = { ...prev };
      matchedSubPartGroups.forEach((g) => {
        next[g.key] = !allMatchedSubGroupsExpanded;
      });
      return next;
    });
  };

  const handleToggleAllUnmatchedSubPartGroups = () => {
    setExpandedSubPartGroups((prev) => {
      const next = { ...prev };
      unmatchedSubPartGroups.forEach((g) => {
        next[g.key] = !allUnmatchedSubGroupsExpanded;
      });
      return next;
    });
  };

  const renderSubPartCardGrid = (items: SiteSubPart[], keyPrefix: string) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {items.map((sub, i) => {
        const subStatus = deriveInventoryPartStatus(sub.inStockDate, sub.outStockDate);
        const specOrCode = (sub.partSpec || sub.partCode || '').trim();
        const showSpecOrCode = Boolean(specOrCode && specOrCode !== sub.partName);
        const showCategory = Boolean(sub.partCategory && sub.partCategory.trim());
        return (
          <div
            key={sub.id || `${keyPrefix}-${i}`}
            className="bg-white p-2 rounded-lg border border-slate-200 text-xs shadow-2xs space-y-1"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-bold text-slate-800 leading-snug break-words min-w-0">
                {sub.partName}
              </div>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${
                  subStatus === 'stock_out'
                    ? 'bg-blue-100 text-blue-800'
                    : subStatus === 'stock_in'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
                }`}
              >
                {subStatus === 'stock_out' ? '出庫済' : subStatus === 'stock_in' ? '入庫済' : '入庫待ち'}
              </span>
            </div>
            {(showCategory || showSpecOrCode) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {showCategory && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 whitespace-nowrap">
                    {sub.partCategory}
                  </span>
                )}
                {showSpecOrCode && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-600 break-all">
                    {specOrCode}
                  </span>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[10px] text-slate-500 pt-0.5 border-t border-slate-100">
              <span className="font-semibold text-slate-700 whitespace-nowrap">
                数量: {sub.quantity}{sub.unit}
              </span>
              <span className="text-slate-400">
                入庫: {normalizeExternalDate(sub.inStockDate) || '未定'} / 出庫: {normalizeExternalDate(sub.outStockDate) || '未定'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );

  // 後付け現場コード連携・在庫検索ステート
  const [showInventoryLinker, setShowInventoryLinker] = useState(false);
  const [inventoryCodeInput, setInventoryCodeInput] = useState(site?.siteCode || '');
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [inventorySearchResults, setInventorySearchResults] = useState<ExternalSiteLookupResult[]>([]);
  const [isSearchingInventory, setIsSearchingInventory] = useState(false);
  const [inventoryLookupError, setInventoryLookupError] = useState<string | null>(null);

  // 添付ファイル・現場写真アップロード用
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [uploadAttachmentError, setUploadAttachmentError] = useState<string | null>(null);
  const [isDragOverAttachment, setIsDragOverAttachment] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const lastOpenedSiteIdRef = React.useRef<string>('');

  const [infoForm, setInfoForm] = useState<Partial<Site>>({});

  useEffect(() => {
    if (!isOpen || !site) {
      lastOpenedSiteIdRef.current = '';
      return;
    }

    // モーダル新規オープンまたは別現場への切り替え時のみ初期化＆在庫ステータス自動監視を実行
    if (lastOpenedSiteIdRef.current !== site.id) {
      lastOpenedSiteIdRef.current = site.id;
      setCurrentSite(site);
      setInfoForm(site);
      setIsEditingInfo(false);
      setActiveTab('info');
      setSyncNotice(null);
      setLastSyncedAt(null);
      setSubParts(site.subPartsCache || []);
      setExpandedSubPartGroups({});
      setInventoryCodeInput(site.siteCode || '');
      setInventorySearchQuery('');
      setInventorySearchResults([]);
      setInventoryLookupError(null);
      setShowInventoryLinker(!site.siteCode || (site.mainParts || []).length === 0);

      if (site.siteCode && site.siteCode.trim()) {
        syncInventoryStatus(site, { silentIfNoChange: true });
      }
    } else if (!isEditingInfo) {
      setCurrentSite(prev => {
        if (!prev || prev.id !== site.id || prev.updatedAt !== site.updatedAt) {
          return site;
        }
        return prev;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, site]);

  const handleStartEditInfo = () => {
    if (currentSite) {
      setInfoForm({ ...currentSite });
      setIsEditingInfo(true);
    }
  };

  const handleSaveInfo = async () => {
    if (!currentSite) return;
    const prevCode = (currentSite.siteCode || '').trim();
    const nextCode = (
      infoForm.siteCode !== undefined ? infoForm.siteCode : (currentSite.siteCode || '')
    ).trim();
    const updated: Site = {
      ...currentSite,
      ...infoForm,
      siteCode: nextCode,
      siteName: (infoForm.siteName || currentSite.siteName || '').trim(),
      egCount: typeof infoForm.egCount === 'number' ? infoForm.egCount : currentSite.egCount,
    };
    setCurrentSite(updated);
    setInventoryCodeInput(nextCode);
    await saveSiteChanges(updated);
    setIsEditingInfo(false);

    // 現場コードが新規設定または別コードへ変更された場合、自動で在庫DB同期を実行
    if (nextCode && nextCode.toLowerCase() !== prevCode.toLowerCase()) {
      await syncInventoryStatus(updated, {
        overrideSiteCode: nextCode,
        previousSiteCode: prevCode,
        manual: true,
      });
    }
  };

  const handleCancelEditInfo = () => {
    if (currentSite) {
      setInfoForm({ ...currentSite });
    }
    setIsEditingInfo(false);
  };

  // 取得済みの在庫データを用いて現場データをマージ/置換・保存する共通ヘルパー
  const applyInventorySyncResult = async (
    targetSite: Site,
    detailData: any,
    lookupCode: string,
    nowTimeJst: string,
    options?: {
      manual?: boolean;
      silentIfNoChange?: boolean;
      replaceExistingMainParts?: boolean;
    }
  ) => {
    const syncResult = mergeInventorySyncWithSite(targetSite, detailData, {
      siteCodeOverride: lookupCode,
      replaceExistingMainParts: options?.replaceExistingMainParts,
    });

    if (syncResult.isFallback) {
      if (options?.manual) {
        setSyncNotice({
          type: 'warning',
          message: `現場コード「${lookupCode}」の外部在庫DBへ接続できないか未登録のため、現在のデータを維持しました。`,
          timestamp: nowTimeJst,
        });
        setInventoryLookupError(`現場コード「${lookupCode}」の在庫情報が見つからないか、外部DBに接続できませんでした。`);
      }
      return;
    }

    setSubParts(syncResult.subParts);
    setLastSyncedAt(nowTimeJst);

    if (syncResult.hasChanges) {
      setCurrentSite(syncResult.updatedSite);
      setInfoForm(syncResult.updatedSite);
      setInventoryCodeInput(syncResult.updatedSite.siteCode || lookupCode);
      await saveSiteChanges(syncResult.updatedSite);
      setShowInventoryLinker(false);
      setSyncNotice({
        type: 'success',
        message: syncResult.summaryMessage || `現場コード「${lookupCode}」の在庫情報・入出庫ステータスを最新化しました。`,
        timestamp: nowTimeJst,
      });
    } else if (options?.manual || !options?.silentIfNoChange) {
      setSyncNotice({
        type: 'info',
        message: `在庫DBを確認しました（現場コード「${lookupCode}」の入庫日・出庫日・進捗は最新です）。`,
        timestamp: nowTimeJst,
      });
    }
  };

  // 在庫DBから入庫日・出庫日・ステータス・未取込/追加部品・付属部品を監視＆同期
  const syncInventoryStatus = async (
    targetSite: Site,
    options?: {
      overrideSiteCode?: string;
      previousSiteCode?: string;
      manual?: boolean;
      silentIfNoChange?: boolean;
      replaceExistingMainParts?: boolean;
    }
  ) => {
    const lookupCode = (options?.overrideSiteCode || targetSite.siteCode || '').trim();
    if (!lookupCode) {
      if (options?.manual) {
        setInventoryLookupError('在庫を取り込む現場コードを入力または選択してください。');
      }
      return;
    }

    setIsLoadingSubParts(true);
    setInventoryLookupError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/sites/lookup/external?code=${encodeURIComponent(lookupCode)}`);
      if (!res.ok) {
        throw new Error(`在庫DB照会に失敗しました (${res.status})`);
      }

      const json = await res.json();
      let detailData: any = json.data
        ? (Array.isArray(json.data) ? json.data[0] : json.data)
        : (json.site || json);

      if (!detailData || typeof detailData !== 'object') {
        detailData = {};
      }
      if (json.isFallback) {
        detailData = { ...detailData, isFallback: true };
      }

      const nowTimeJst = new Date().toLocaleTimeString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const prevCode = (
        options?.previousSiteCode !== undefined ? options.previousSiteCode : (targetSite.siteCode || '')
      ).trim();
      const isCodeChanged = prevCode !== '' && prevCode.toLowerCase() !== lookupCode.toLowerCase();
      const isFirstLinkWithExistingParts = prevCode === '' && (targetSite.mainParts?.length || 0) > 0;

      // 現場コードを変更（または手動部品がある現場へ初回コード連携）した場合、確認モーダルで全差し替えを確認
      if (
        options?.manual &&
        options?.replaceExistingMainParts === undefined &&
        (isCodeChanged || isFirstLinkWithExistingParts) &&
        (targetSite.mainParts?.length || 0) > 0
      ) {
        const previewExpanded = expandExternalSitePayload(detailData, {
          primaryWorkerId: targetSite.primaryWorkerId,
          primaryWorkerName: targetSite.primaryWorkerName,
          defaultConstructionDate: targetSite.constructionDate || targetSite.startDate || '',
        });

        if (previewExpanded.isFallback) {
          setSyncNotice({
            type: 'warning',
            message: `現場コード「${lookupCode}」の外部在庫DBへ接続できないか未登録のため、現在のデータを維持しました。`,
            timestamp: nowTimeJst,
          });
          setInventoryLookupError(`現場コード「${lookupCode}」の在庫情報が見つからないか、外部DBに接続できませんでした。`);
          return;
        }

        if (previewExpanded.mainParts.length > 0) {
          setConfirmModal({
            isOpen: true,
            title: '在庫データによる主要部品の置き換え確認',
            message: `現場コードを「${prevCode || '未連携'}」→「${lookupCode}」へ連携します。\n\n現在登録されている主要部品（${targetSite.mainParts.length}台）を、現場コード「${lookupCode}」の在庫データ（主要部品 ${previewExpanded.mainParts.length}台 / 付属部品 ${previewExpanded.subParts.length}件）で置き換えますか？`,
            confirmText: `在庫データ（${previewExpanded.mainParts.length}台）で置き換える`,
            cancelText: '既存部品を維持する',
            type: 'info',
            onConfirm: () => {
              applyInventorySyncResult(targetSite, detailData, lookupCode, nowTimeJst, {
                manual: true,
                replaceExistingMainParts: true,
              });
            },
            onCancel: () => {
              // 既存部品を残したまま未マッチ部品のみ追記・同期したい場合はマージせずそのまま維持
              setSyncNotice({
                type: 'info',
                message: `既存の主要部品（${targetSite.mainParts.length}台）を維持しました。`,
                timestamp: nowTimeJst,
              });
            },
          });
          return;
        }
      }

      await applyInventorySyncResult(targetSite, detailData, lookupCode, nowTimeJst, {
        manual: options?.manual,
        silentIfNoChange: options?.silentIfNoChange,
        replaceExistingMainParts: options?.replaceExistingMainParts,
      });
    } catch (e: any) {
      console.warn('Failed to sync inventory status:', e);
      if (options?.manual) {
        setInventoryLookupError(e.message || '在庫DBとの同期に失敗しました。');
      }
    } finally {
      setIsLoadingSubParts(false);
    }
  };

  // 後付け現場コード検索（詳細モーダル内）
  const handleSearchInventoryForSite = async () => {
    const q = inventorySearchQuery.trim();
    if (!q) return;
    setIsSearchingInventory(true);
    setInventoryLookupError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/sites/lookup/external?q=${encodeURIComponent(q)}&limit=10`);
      if (!res.ok) {
        throw new Error(`検索に失敗しました (${res.status})`);
      }
      const json = await res.json();
      const rawResults = Array.isArray(json.data)
        ? json.data
        : Array.isArray(json.sites)
          ? json.sites
          : Array.isArray(json)
            ? json
            : [];

      const normalized: ExternalSiteLookupResult[] = rawResults.map((item: any) => ({
        ...item,
        code: String(item.code || item.siteCode || '').trim(),
        siteCode: String(item.code || item.siteCode || '').trim(),
        name: String(item.name || item.siteName || '').trim(),
        siteName: String(item.name || item.siteName || '').trim(),
        orderNo: item.drawingNo || item.orderNo || '',
      }));

      setInventorySearchResults(normalized);
      if (normalized.length === 0) {
        setInventoryLookupError('該当する在庫データが見つかりませんでした。');
      }
    } catch (err: any) {
      console.warn('Detail external search error:', err);
      setInventoryLookupError('在庫DBの検索に失敗しました。');
    } finally {
      setIsSearchingInventory(false);
    }
  };

  // 全体ステータスの更新
  const handleUpdateStatus = async (newStatus: SiteStatus) => {
    if (!currentSite) return;
    const updated = { ...currentSite, status: newStatus };
    setCurrentSite(updated);
    await saveSiteChanges(updated);
  };

  // 主要部品のステータスまたは日付のクイック更新
  const handleUpdatePart = async (partId: string, updates: Partial<SiteMainPart>) => {
    if (!currentSite) return;
    const newMainParts = currentSite.mainParts.map(p => {
      if (p.id === partId) {
        const merged: SiteMainPart = { ...p, ...updates };
        if ((updates.inStockDate !== undefined || updates.outStockDate !== undefined) && updates.status === undefined) {
          if (p.status !== 'constructed' && p.status !== 'inspected') {
            merged.status = deriveInventoryPartStatus(merged.inStockDate, merged.outStockDate);
          }
        }
        return merged;
      }
      return p;
    });

    // 部品すべてが施工済なら全体ステータスも完了に近づける（部品0件時は完了扱いにしない）
    const allConstructed = newMainParts.length > 0 && newMainParts.every(p => p.status === 'constructed' || p.status === 'inspected');
    const newSiteStatus: SiteStatus = allConstructed
      ? 'completed'
      : (newMainParts.some(p => p.status !== 'waiting_stock') && currentSite.status === 'not_started'
          ? 'in_progress'
          : currentSite.status);

    const updated = {
      ...currentSite,
      mainParts: newMainParts,
      status: newSiteStatus
    };
    setCurrentSite(updated);
    await saveSiteChanges(updated);
  };

  // サーバーへ変更を保存
  const saveSiteChanges = async (targetSite: Site) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/sites/${targetSite.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetSite)
      });
      if (!res.ok) {
        throw new Error(`更新に失敗しました (${res.status})`);
      }
      const json = await res.json();
      if (json.success && json.site) {
        onUpdateSite(json.site);
        setCurrentSite(json.site);
      }
    } catch (err: any) {
      console.error('Save site error:', err);
      setSaveError(err.message || '更新に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  // コメント投稿
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSite || !commentInput.trim()) return;

    setIsSubmittingComment(true);
    try {
      const res = await fetch(`${API_BASE_URL}/sites/${currentSite.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: commentInput.trim(),
          user: currentUser
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.comment) {
          const updatedComments = [...(currentSite.comments || []), json.comment];
          const updatedSite = { ...currentSite, comments: updatedComments };
          setCurrentSite(updatedSite);
          onUpdateSite(updatedSite);
          setCommentInput('');
        }
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // 画像判定ヘルパー
  const isImageAttachment = (att: { url?: string; name?: string }) => {
    const target = `${att.url || ''} ${att.name || ''}`.toLowerCase();
    return /\.(jpe?g|png|gif|webp|svg|bmp)(\?.*)?$/i.test(target);
  };

  // ファイル・写真アップロード処理（端末ファイル・カメラ撮影・D&D複数一括対応）
  const handleUploadFiles = async (files: FileList | File[]) => {
    if (!currentSite || !files || files.length === 0) return;
    setIsUploadingAttachment(true);
    setUploadAttachmentError(null);

    const fileList = Array.from(files);
    const newAttachments: SiteAttachment[] = [];
    const errors: string[] = [];

    for (const file of fileList) {
      try {
        const uploaded = await uploadFile(file);
        newAttachments.push({
          id: uploaded.id || `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: uploaded.name || file.name,
          url: uploaded.url,
          size: file.size,
          uploadedBy: currentUser.name || '担当者',
          uploadedAt: new Date().toISOString(),
        });
      } catch (err: any) {
        console.error('File upload error:', err);
        errors.push(`${file.name}: ${err.message || 'アップロード失敗'}`);
      }
    }

    if (errors.length > 0) {
      setUploadAttachmentError(errors.join('\n'));
    }

    if (newAttachments.length > 0) {
      const updated: Site = {
        ...currentSite,
        attachments: [...(currentSite.attachments || []), ...newAttachments]
      };
      setCurrentSite(updated);
      await saveSiteChanges(updated);
    }

    setIsUploadingAttachment(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  // 添付ファイル削除
  const handleRemoveAttachment = async (attachmentId: string) => {
    if (!currentSite) return;
    const targetAtt = (currentSite.attachments || []).find(a => a.id === attachmentId);
    const confirmName = targetAtt ? `「${targetAtt.name}」` : 'この添付ファイル';
    setConfirmModal({
      isOpen: true,
      title: '添付ファイルの削除',
      message: `${confirmName}を削除してもよろしいですか？`,
      confirmText: '削除する',
      cancelText: 'キャンセル',
      type: 'danger',
      onConfirm: async () => {
        const updatedAttachments = (currentSite.attachments || []).filter(a => a.id !== attachmentId);
        const updated: Site = {
          ...currentSite,
          attachments: updatedAttachments
        };
        setCurrentSite(updated);
        await saveSiteChanges(updated);
      }
    });
  };

  // 現場削除
  const handleDelete = () => {
    if (!currentSite) return;
    setConfirmModal({
      isOpen: true,
      title: '現場情報の完全削除',
      message: `現場「${currentSite.siteName}」を完全に削除してもよろしいですか？`,
      confirmText: '削除する',
      cancelText: 'キャンセル',
      type: 'danger',
      onConfirm: () => {
        onDeleteSite(currentSite.id);
        onClose();
      }
    });
  };

  // 簡易エクスポート（CRM用データプレビュー & CSV出力）
  const handleExportCsv = () => {
    if (!currentSite) return;
    const rows = [
      ['現場コード', '図面番号', '現場名', 'EG台数', '号機/台数', '元請', '工期開始', '工期終了', '施工日', '主担当', '部品型番', '品名', '入庫日', '出庫日', '部品施工日', '部品担当', '進捗状況'],
      ...currentSite.mainParts.map((p, idx) => {
        const total = p.originalQuantity && p.originalQuantity > 1 ? p.originalQuantity : (currentSite.egCount > 1 ? currentSite.egCount : (currentSite.mainParts.length > 1 ? currentSite.mainParts.length : 1));
        const uIdx = p.unitIndex || (idx + 1);
        const unitLabel = total > 1 ? `${uIdx}/${total}台目` : `${uIdx}台目`;
        return [
          currentSite.siteCode || '',
          currentSite.orderNo || '',
          currentSite.siteName,
          currentSite.egCount,
          unitLabel,
          currentSite.customerName || '',
          currentSite.startDate || '',
          currentSite.endDate || '',
          currentSite.constructionDate || '',
          currentSite.primaryWorkerName || '',
          p.partCode,
          p.partName,
          p.inStockDate || '',
          p.outStockDate || '',
          p.constructionDate || '',
          p.workerName || '',
          p.status
        ];
      })
    ];

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + rows.map(e => e.map(cell => `"${cell}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const fileKey = currentSite.siteCode || currentSite.orderNo || currentSite.siteName;
    link.setAttribute("download", `現場_${fileKey}_施工データ.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen || !site || !currentSite) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* モーダルヘッダー */}
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 rounded-t-2xl">
          <div className="flex items-center gap-3">
            {currentSite.siteCode ? (
              <a
                href={`https://sql.teranago.synology.me/genba?code=${encodeURIComponent(currentSite.siteCode.trim())}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-extrabold text-sm text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100/90 border border-indigo-200 hover:border-indigo-300 px-2.5 py-1 rounded-lg shadow-2xs transition-all cursor-pointer group/code"
                title={`現場コード「${currentSite.siteCode}」の外部データを新規ウインドウで開く`}
              >
                <span>{currentSite.siteCode}</span>
                <ExternalLink className="w-3.5 h-3.5 text-indigo-500 group-hover/code:text-indigo-800 transition-colors" />
              </a>
            ) : (
              <span className="font-extrabold text-sm text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg shadow-2xs">
                コード未連携
              </span>
            )}
            <div>
              <h3 className="font-bold text-lg text-slate-900 flex flex-wrap items-center gap-2">
                <span>{currentSite.siteName}</span>
                {currentSite.orderNo && (
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                    図面番号: {currentSite.orderNo}
                  </span>
                )}
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                  EG {currentSite.egCount}台
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                元請: {currentSite.customerName || '未設定'} / 施工場所: {currentSite.address || '未設定'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* ステータスバッジ切り替え */}
            <select
              value={currentSite.status}
              onChange={(e) => handleUpdateStatus(e.target.value as SiteStatus)}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border cursor-pointer ${
                currentSite.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                currentSite.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-300' :
                currentSite.status === 'on_hold' ? 'bg-rose-50 text-rose-700 border-rose-300' :
                'bg-slate-100 text-slate-700 border-slate-300'
              }`}
            >
              <option value="not_started">未着手</option>
              <option value="in_progress">施工進行中</option>
              <option value="completed">全施工完了</option>
              <option value="on_hold">保留</option>
            </select>

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200/70 text-slate-400 hover:text-slate-600 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* サブナビゲーションタブ */}
        <div className="flex border-b border-slate-200 bg-white px-5 text-xs font-bold text-slate-600 gap-6 overflow-x-auto">
          {/* 1番目: ダッシュボード */}
          <button
            onClick={() => setActiveTab('info')}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
              activeTab === 'info'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 text-indigo-600" />
            <span>ダッシュボード</span>
          </button>

          {/* 2番目: 主要部品・施工進捗 */}
          <button
            onClick={() => setActiveTab('parts')}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'parts'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>主要部品・施工進捗 ({currentSite.mainParts.length}台)</span>
          </button>

          {/* 3番目: 施工図面・申し送り・添付ファイル */}
          <button
            onClick={() => setActiveTab('timeline')}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'timeline'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-indigo-600" />
            <span>施工図面・申し送り・添付 ({currentSite.comments?.length || 0})</span>
          </button>

          {/* 4番目: 施工予定・実績 */}
          <button
            onClick={() => setActiveTab('schedule')}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'schedule'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Calendar className="w-4 h-4 text-amber-600" />
            <span className="flex items-center gap-1">
              <span>施工予定・実績</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                siteEvents.length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
              }`}>
                {siteEvents.length}
              </span>
            </span>
          </button>

          {/* 5番目: 自主検査書・Excel */}
          <button
            onClick={() => setActiveTab('export')}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'export'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>自主検査書・Excel</span>
          </button>
        </div>

        {/* コンテンツボディ */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {saveError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* 在庫DB入出庫監視・同期バナー */}
          {syncNotice && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                syncNotice.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : syncNotice.type === 'warning'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-indigo-50 border-indigo-200 text-indigo-800'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {syncNotice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : syncNotice.type === 'warning' ? (
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                ) : (
                  <Database className="w-4 h-4 shrink-0 text-indigo-600" />
                )}
                <span>{syncNotice.message}</span>
                <span className="text-[10px] font-mono opacity-75">({syncNotice.timestamp} JST確認)</span>
              </div>
              <button
                type="button"
                onClick={() => setSyncNotice(null)}
                className="p-1 rounded hover:bg-black/5 cursor-pointer shrink-0"
                title="閉じる"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* TAB 2: 主要部品 & 付属部品 */}
          {activeTab === 'parts' && (
            <div className="space-y-6">
              {/* 現場コード連携・在庫データベース情報取り込み / 入出庫同期カード */}
              <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-200/80 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Database className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h5 className="font-bold text-sm text-indigo-950">
                          現場コード同期・在庫情報取り込み
                        </h5>
                        {currentSite.siteCode && (
                          <a
                            href={`https://sql.teranago.synology.me/genba?code=${encodeURIComponent(currentSite.siteCode.trim())}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono font-bold text-xs bg-white hover:bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded border border-indigo-200 transition-colors"
                            title={`現場コード「${currentSite.siteCode}」の外部データを新規ウインドウで開く`}
                          >
                            <span>{currentSite.siteCode}</span>
                            <ExternalLink className="w-3 h-3 text-indigo-500" />
                          </a>
                        )}
                        {lastSyncedAt && (
                          <span className="text-[11px] font-mono tabular-nums text-indigo-700">
                            最終確認: {lastSyncedAt} JST
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-indigo-700/90 mt-0.5">
                        {currentSite.siteCode
                          ? `現場コード「${currentSite.siteCode}」と連携中です（画面を開くたびに入庫日・出庫日を監視して自動更新します）。`
                          : '現場コードが未連携のため自動監視は停止中です。現場コードを紐づけて在庫DBから部品・入出庫情報を一括取り込みできます。'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {currentSite.siteCode && (
                      <button
                        type="button"
                        onClick={() => syncInventoryStatus(currentSite, { manual: true })}
                        disabled={isLoadingSubParts}
                        className="px-3 py-1.5 bg-white hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSubParts ? 'animate-spin' : ''}`} />
                        <span>今すぐ入出庫を同期</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowInventoryLinker((prev) => !prev)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {showInventoryLinker
                        ? '閉じる'
                        : currentSite.siteCode
                          ? '別コードで取込・変更'
                          : '現場コードを検索/連携'}
                    </button>
                  </div>
                </div>

                {showInventoryLinker && (
                  <div className="pt-3 border-t border-indigo-200/80 space-y-3">
                    {/* 直接現場コード指定取込 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold text-indigo-900">
                          ① 現場コードを直接指定して在庫取込
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={inventoryCodeInput}
                            onChange={(e) => setInventoryCodeInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                syncInventoryStatus(currentSite, { overrideSiteCode: inventoryCodeInput, manual: true });
                              }
                            }}
                            placeholder="例: NHQ136A"
                            className="flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => syncInventoryStatus(currentSite, { overrideSiteCode: inventoryCodeInput, manual: true })}
                            disabled={isLoadingSubParts || !inventoryCodeInput.trim()}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer"
                          >
                            {isLoadingSubParts ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                            <span>取込実行</span>
                          </button>
                        </div>
                      </div>

                      {/* キーワード検索で現場コードを探索 */}
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold text-indigo-900">
                          ② 在庫DBから現場名・コードで検索して連携
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={inventorySearchQuery}
                            onChange={(e) => setInventorySearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSearchInventoryForSite();
                              }
                            }}
                            placeholder={currentSite.siteName || '現場名やコードを入力...'}
                            className="flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={handleSearchInventoryForSite}
                            disabled={isSearchingInventory || !inventorySearchQuery.trim()}
                            className="px-3 py-1.5 bg-white hover:bg-indigo-100 disabled:opacity-50 text-indigo-700 border border-indigo-300 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer"
                          >
                            {isSearchingInventory ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                            <span>検索</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {inventoryLookupError && (
                      <p className="text-xs text-rose-600 font-semibold">{inventoryLookupError}</p>
                    )}

                    {inventorySearchResults.length > 0 && (
                      <div className="bg-white border border-indigo-200 rounded-lg p-2 max-h-44 overflow-y-auto space-y-1">
                        <div className="text-[11px] font-bold text-slate-500 px-2 py-0.5">
                          在庫DB検索結果 ({inventorySearchResults.length}件) - クリックで現場コード連携＆在庫取込:
                        </div>
                        {inventorySearchResults.map((res, i) => {
                          const codeVal = res.code || res.siteCode || '';
                          const nameVal = res.name || res.siteName || '（名称未設定）';
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                if (codeVal) {
                                  setInventoryCodeInput(codeVal);
                                  setInventorySearchResults([]);
                                  syncInventoryStatus(currentSite, { overrideSiteCode: codeVal, manual: true });
                                }
                              }}
                              className="w-full text-left p-2 hover:bg-indigo-50 rounded-lg flex items-center justify-between gap-2 border border-slate-100 hover:border-indigo-200 transition-colors cursor-pointer"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                                  {codeVal || '(コードなし)'}
                                </span>
                                <span className="font-bold text-slate-800">{nameVal}</span>
                                {res.customerName && <span className="text-slate-500">({res.customerName})</span>}
                                {res.egCount !== undefined && res.egCount > 0 ? (
                                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">EG: {res.egCount}台</span>
                                ) : null}
                              </div>
                              <span className="text-indigo-600 font-bold shrink-0 whitespace-nowrap">連携・取込 →</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 主要部品 (1台ずつ分割管理・建具ごとの付属部品トグル付) */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-indigo-600" />
                      主要部品施工管理（1台ごと展開）
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      現場コード連携時はモーダルを開くたびに入庫日・出庫日・進捗を監視して自動更新します。
                    </p>
                  </div>
                  {matchedSubPartGroups.length > 0 && (
                    <button
                      type="button"
                      onClick={handleToggleAllMatchedSubPartGroups}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {allMatchedSubGroupsExpanded ? '付属部品をすべて閉じる' : '付属部品をすべて展開'}
                    </button>
                  )}
                </div>

                {currentSite.mainParts.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
                    <p className="text-xs font-semibold text-slate-600">
                      主要部品はまだ登録されていません。
                    </p>
                    <p className="text-[11px] text-slate-400">
                      上の「現場コードを検索/連携」から現場コードを紐づけると、在庫データベースから主要部品・付属部品を自動取り込みできます。
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowInventoryLinker(true)}
                      className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Database className="w-3.5 h-3.5" />
                      <span>現場コードから在庫を取り込む</span>
                    </button>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 shadow-2xs">
                    {currentSite.mainParts.map((part, idx) => {
                      const attachedSubGroup = mainPartSubGroupByIdx.get(idx);
                      const isAttachedExpanded = attachedSubGroup
                        ? Boolean(expandedSubPartGroups[attachedSubGroup.key])
                        : false;

                      return (
                        <div key={part.id || idx} className="p-3 bg-white hover:bg-slate-50/40 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              {/* 建具番号 (tateguNo) バッジ & 真下の付属部品トグル */}
                              <div className="flex flex-col items-stretch gap-1 shrink-0 w-20">
                                <div className="relative group">
                                  <input
                                    type="text"
                                    value={part.fittingNo || ''}
                                    placeholder={getFittingLabel(part, idx, currentSite.egCount)}
                                    title="建具番号 (例: AD1, W-1) をクリックして変更・編集可能"
                                    onChange={(e) => handleUpdatePart(part.id, { fittingNo: e.target.value })}
                                    className="w-20 px-2 py-1 text-center font-bold text-xs text-indigo-700 bg-indigo-50/90 hover:bg-white focus:bg-white border border-indigo-200 focus:border-indigo-500 rounded-md shadow-2xs transition-all focus:ring-1 focus:ring-indigo-400 outline-none cursor-pointer"
                                  />
                                  <span className="text-[9px] font-bold text-indigo-500 absolute -top-2 left-1.5 px-0.5 bg-white scale-90 origin-left pointer-events-none">
                                    建具
                                  </span>
                                </div>
                                {attachedSubGroup && (
                                  <button
                                    type="button"
                                    onClick={() => toggleSubPartGroup(attachedSubGroup.key)}
                                    title={`建具 ${attachedSubGroup.label} の付属部品 (${attachedSubGroup.counts.total}点) を${isAttachedExpanded ? '閉じる' : '展開'}`}
                                    className={`w-full px-1 py-0.5 rounded border text-[10px] font-bold flex items-center justify-center gap-0.5 transition-colors cursor-pointer whitespace-nowrap ${
                                      isAttachedExpanded
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border-slate-200 hover:border-indigo-300'
                                    }`}
                                  >
                                    {isAttachedExpanded ? (
                                      <ChevronDown className="w-3 h-3 shrink-0" />
                                    ) : (
                                      <ChevronRight className="w-3 h-3 shrink-0" />
                                    )}
                                    <span>付属 {attachedSubGroup.counts.total}</span>
                                  </button>
                                )}
                              </div>

                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                <span className="text-sm font-bold text-slate-900">
                                  {cleanPartName(part.partName)}
                                </span>
                                {(part.partSpec || part.partCode) && (
                                  <span className="text-xs font-mono text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md w-fit font-medium">
                                    {part.partSpec || part.partCode}
                                  </span>
                                )}
                                {part.serialNo && (
                                  <span className="text-[10px] text-slate-400 font-mono">機番: {part.serialNo}</span>
                                )}
                              </div>
                            </div>

                            {/* 各部品の施工設定コントロール */}
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              {/* 入庫日 */}
                              <div className="flex items-center gap-1 bg-amber-50/60 border border-amber-200 px-2 py-1 rounded">
                                <span className="text-[10px] text-amber-700 font-semibold">入庫:</span>
                                <input
                                  type="date"
                                  value={normalizeExternalDate(part.inStockDate) || ''}
                                  onChange={(e) => handleUpdatePart(part.id, { inStockDate: e.target.value })}
                                  className="text-[11px] bg-transparent border-none p-0 focus:ring-0 cursor-pointer text-slate-700"
                                />
                              </div>

                              {/* 出庫日 */}
                              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded">
                                <span className="text-[10px] text-slate-500 font-semibold">出庫:</span>
                                <input
                                  type="date"
                                  value={normalizeExternalDate(part.outStockDate) || ''}
                                  onChange={(e) => handleUpdatePart(part.id, { outStockDate: e.target.value })}
                                  className="text-[11px] bg-transparent border-none p-0 focus:ring-0 cursor-pointer text-slate-700"
                                />
                              </div>

                              {/* 施工日 */}
                              <div className="flex items-center gap-1 bg-indigo-50/60 border border-indigo-200 px-2 py-1 rounded">
                                <span className="text-[10px] text-indigo-700 font-bold">施工:</span>
                                <input
                                  type="date"
                                  value={normalizeExternalDate(part.constructionDate) || ''}
                                  onChange={(e) => handleUpdatePart(part.id, { constructionDate: e.target.value })}
                                  className="text-[11px] bg-transparent border-none p-0 focus:ring-0 cursor-pointer font-bold text-indigo-900"
                                />
                              </div>

                              {/* 担当者 */}
                              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded">
                                <span className="text-[10px] text-slate-500 font-semibold">担当:</span>
                                <select
                                  value={part.workerId || currentSite.primaryWorkerId || ''}
                                  onChange={(e) => {
                                    const u = allUsers.find(x => x.id === e.target.value);
                                    handleUpdatePart(part.id, {
                                      workerId: e.target.value,
                                      workerName: u?.name || ''
                                    });
                                  }}
                                  className="text-[11px] bg-transparent border-none p-0 focus:ring-0 cursor-pointer font-medium text-slate-800"
                                >
                                  <option value="">未割当</option>
                                  {allUsers.map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                  ))}
                                </select>
                              </div>

                              {/* 進捗ステータス */}
                              <select
                                value={part.status}
                                onChange={(e) => handleUpdatePart(part.id, { status: e.target.value as PartStatus })}
                                className={`text-xs font-bold px-2 py-1 rounded border cursor-pointer ${
                                  part.status === 'constructed' ? 'bg-indigo-100 text-indigo-800 border-indigo-300' :
                                  part.status === 'inspected' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                                  part.status === 'stock_out' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                                  part.status === 'stock_in' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                                  'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                <option value="waiting_stock">入庫待ち</option>
                                <option value="stock_in">入庫済</option>
                                <option value="stock_out">出庫済</option>
                                <option value="constructed">施工済</option>
                                <option value="inspected">自主検査済</option>
                              </select>
                            </div>
                          </div>

                          {/* 該当建具の付属部品（トグル展開時のみ真下に表示） */}
                          {attachedSubGroup && isAttachedExpanded && (
                            <div className="mt-2.5 pt-2.5 px-3 pb-3 -mx-3 -mb-3 border-t border-indigo-100 bg-slate-50/80 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[11px] font-bold text-indigo-800">
                                  建具 {attachedSubGroup.label} の付属部品（{attachedSubGroup.counts.total}点）
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {attachedSubGroup.counts.stockOut > 0 && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 whitespace-nowrap">
                                      出庫済 {attachedSubGroup.counts.stockOut}
                                    </span>
                                  )}
                                  {attachedSubGroup.counts.stockIn > 0 && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 whitespace-nowrap">
                                      入庫済 {attachedSubGroup.counts.stockIn}
                                    </span>
                                  )}
                                  {attachedSubGroup.counts.waiting > 0 && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-600 whitespace-nowrap">
                                      待ち {attachedSubGroup.counts.waiting}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {renderSubPartCardGrid(attachedSubGroup.items, `main-${attachedSubGroup.key}`)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* その他の付属部品一覧（建具符号なし・EG対象外） */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h5 className="font-bold text-xs text-slate-700">
                      その他の付属部品一覧（建具符号なし・EG対象外）
                    </h5>
                    {unmatchedSubPartsTotalCount > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200/80 text-slate-700 whitespace-nowrap">
                        計 {unmatchedSubPartsTotalCount}点
                      </span>
                    )}
                    {isLoadingSubParts && (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {unmatchedSubPartGroups.length > 0 && (
                      <button
                        type="button"
                        onClick={handleToggleAllUnmatchedSubPartGroups}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {allUnmatchedSubGroupsExpanded ? 'すべて閉じる' : 'すべて展開'}
                      </button>
                    )}
                  </div>
                </div>

                {subParts.length === 0 ? (
                  <div className="text-xs text-slate-400 italic">
                    付属部品データはありません。
                  </div>
                ) : unmatchedSubPartGroups.length === 0 ? (
                  <div className="text-xs text-slate-500">
                    すべての付属部品（計 {subParts.length}点）は上の各建具の真下に紐づけて表示しています。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {unmatchedSubPartGroups.map((group) => {
                      const isExpanded = Boolean(expandedSubPartGroups[group.key]);
                      return (
                        <div
                          key={group.key}
                          className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs"
                        >
                          <button
                            type="button"
                            onClick={() => toggleSubPartGroup(group.key)}
                            className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                              )}
                              <span
                                className={`text-xs font-bold px-2 py-0.5 rounded border shrink-0 whitespace-nowrap ${
                                  group.fittingNo
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {group.fittingNo ? `建具 ${group.label}（EGなし）` : group.label}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded whitespace-nowrap">
                                {group.counts.total}点
                              </span>
                              {group.counts.stockOut > 0 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 whitespace-nowrap">
                                  出庫済 {group.counts.stockOut}
                                </span>
                              )}
                              {group.counts.stockIn > 0 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 whitespace-nowrap">
                                  入庫済 {group.counts.stockIn}
                                </span>
                              )}
                              {group.counts.waiting > 0 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 whitespace-nowrap">
                                  待ち {group.counts.waiting}
                                </span>
                              )}
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="px-3 pb-3 pt-2 border-t border-slate-100 bg-slate-50/50">
                              {renderSubPartCardGrid(group.items, `other-${group.key}`)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: 施工図面・申し送り・添付ファイル */}
          {activeTab === 'timeline' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {/* 左列: 添付ファイル・現場写真・指示書 (左上) + 図面 (NAS 02-施工図PDF) (左下) */}
              <div className="space-y-5">
                {/* 1. 添付ファイル・現場写真・指示書（左上） */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                    <div className="flex items-center gap-1.5">
                      <Paperclip className="w-4 h-4 text-indigo-600" />
                      <h5 className="font-bold text-sm text-slate-800">添付ファイル・現場写真・指示書</h5>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                        {currentSite.attachments?.length || 0}件
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* スマホカメラ起動ボタン */}
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={isUploadingAttachment}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                        title="現場写真をカメラで直接撮影"
                      >
                        <Camera className="w-3.5 h-3.5 text-indigo-600" />
                        <span>写真撮影</span>
                      </button>

                      {/* 端末ファイル選択ボタン */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingAttachment}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                        title="PCや端末から写真・ファイルを選択"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>アップロード</span>
                      </button>

                      {/* 隠し input 要素 */}
                      <input
                        type="file"
                        ref={cameraInputRef}
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            handleUploadFiles(e.target.files);
                          }
                        }}
                      />
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="*/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            handleUploadFiles(e.target.files);
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* ドラッグ＆ドロップ領域 */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragOverAttachment(true); }}
                    onDragLeave={() => setIsDragOverAttachment(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOverAttachment(false);
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        handleUploadFiles(e.dataTransfer.files);
                      }
                    }}
                    className={`p-3 rounded-xl border-2 border-dashed transition-all text-center ${
                      isDragOverAttachment
                        ? 'border-indigo-500 bg-indigo-50/80 ring-2 ring-indigo-500/20 shadow-md'
                        : 'border-slate-300 bg-white hover:border-slate-400'
                    }`}
                  >
                    <div className="py-0.5 space-y-0.5">
                      <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center mb-0.5 shadow-2xs">
                        <UploadCloud className="w-3.5 h-3.5" />
                      </div>
                      <p className="text-xs font-bold text-slate-700">
                        写真・指示書ファイルをドラッグ＆ドロップ（複数一括対応）
                      </p>
                      <p className="text-[10px] text-slate-400">
                        画像・PDF・Officeファイルを直接アップロード
                      </p>
                    </div>
                  </div>

                  {/* アップロード進行中インジケーター */}
                  {isUploadingAttachment && (
                    <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-center gap-2 text-xs font-bold text-indigo-700 animate-pulse">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                      <span>ファイルをアップロードして保存中...</span>
                    </div>
                  )}

                  {/* アップロードエラー表示 */}
                  {uploadAttachmentError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-1.5 whitespace-pre-wrap">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                      <div>{uploadAttachmentError}</div>
                    </div>
                  )}

                  {/* 添付ファイル・写真一覧 */}
                  {(!currentSite.attachments || currentSite.attachments.length === 0) ? (
                    <div className="text-xs text-slate-400 italic py-2 text-center bg-white rounded-lg border border-slate-200">
                      添付ファイル・現場写真はありません。上のボタンまたはドラッグ＆ドロップで追加してください。
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                      {currentSite.attachments.map((att) => {
                        const isImg = isImageAttachment(att);
                        const fileUrl = resolveFileUrl(att.url);
                        const formattedSize = typeof att.size === 'number'
                          ? att.size > 1024 * 1024
                            ? `${(att.size / (1024 * 1024)).toFixed(2)} MB`
                            : `${(att.size / 1024).toFixed(1)} KB`
                          : (att.size || '');

                        const formattedDate = att.uploadedAt
                          ? new Date(att.uploadedAt).toLocaleString('ja-JP', {
                              timeZone: 'Asia/Tokyo',
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '';

                        return (
                          <div
                            key={att.id}
                            className="flex items-center justify-between p-2.5 bg-white rounded-xl text-xs border border-slate-200 hover:border-indigo-300 shadow-2xs gap-2 transition-all"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {/* サムネイル画像またはファイル種別アイコン */}
                              {isImg ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewFile({
                                      id: att.id,
                                      name: att.name,
                                      url: fileUrl,
                                      size: formattedSize,
                                      type: 'image',
                                    });
                                    setIsPreviewOpen(true);
                                  }}
                                  className="w-11 h-11 shrink-0 rounded-lg overflow-hidden border border-slate-200 hover:opacity-85 transition-opacity cursor-pointer shadow-2xs bg-slate-100 flex items-center justify-center"
                                  title="拡大プレビュー"
                                >
                                  <img
                                    src={fileUrl}
                                    alt={att.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      // 画像ロード失敗時はフォールバック
                                      (e.target as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                </button>
                              ) : (
                                <div className="w-11 h-11 shrink-0 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shadow-2xs">
                                  <FileText className="w-5 h-5" />
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <span className="font-bold text-slate-800 truncate block text-xs" title={att.name}>
                                  {att.name}
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                                  {formattedSize && <span>{formattedSize}</span>}
                                  {formattedSize && att.uploadedBy && <span>•</span>}
                                  {att.uploadedBy && (
                                    <button
                                      type="button"
                                      onClick={() => triggerOpenUserModal(att.uploadedBy)}
                                      className="hover:text-indigo-600 hover:underline font-medium transition-colors cursor-pointer"
                                      title="登録者の社員詳細を表示"
                                    >
                                      {att.uploadedBy}
                                    </button>
                                  )}
                                  {formattedDate && <span>•</span>}
                                  {formattedDate && <span>{formattedDate}</span>}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setPreviewFile({
                                    id: att.id,
                                    name: att.name,
                                    url: fileUrl,
                                    size: formattedSize,
                                    type: isImg ? 'image' : (att as any).type || '',
                                  });
                                  setIsPreviewOpen(true);
                                }}
                                className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
                                title="プレビュー閲覧"
                              >
                                <Eye className="w-3 h-3" />
                                <span>閲覧</span>
                              </button>

                              <a
                                href={fileUrl}
                                download={att.name}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors border border-slate-200"
                                title="ダウンロード"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>

                              <button
                                type="button"
                                onClick={() => handleRemoveAttachment(att.id)}
                                className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                                title="添付ファイルを削除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. NAS施工図PDF連携 (02-施工図PDF)（左下） */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h5 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      <span>NAS施工図PDF連携 (02-施工図PDF)</span>
                    </h5>
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-bold">
                      D&D / パス自動整形
                    </span>
                  </div>

                  {/* 多機能 複数NAS施工図PDFリスト & 一括D&Dエリア */}
                  {(() => {
                    const currentDrawings = getSiteDrawingList(currentSite);

                    const handleAddPaths = async (rawInput: string) => {
                      if (!rawInput.trim() || !currentSite) return;
                      const lines = rawInput.split(/[\r\n,;]+/).map(s => s.trim()).filter(Boolean);
                      const resolvedList: string[] = [];
                      const errors: string[] = [];

                      for (const item of lines) {
                        const check = await validateAndResolveDrawingPath(item);
                        if (check.valid && check.resolvedPath) {
                          resolvedList.push(check.resolvedPath);
                        } else if (check.error) {
                          errors.push(check.error);
                        }
                      }

                      if (errors.length > 0) {
                        setDrawingErrorModal(errors.join('\n\n'));
                      }

                      if (resolvedList.length > 0) {
                        const updatedList = Array.from(new Set([...currentDrawings, ...resolvedList]));
                        const primary = updatedList[0];
                        const updated = { ...currentSite, drawingUrl: primary, drawings: updatedList };
                        setCurrentSite(updated);
                        saveSiteChanges(updated);
                      }
                    };

                    const handleRemoveDrawing = (indexToRemove: number) => {
                      if (!currentSite) return;
                      const updatedList = currentDrawings.filter((_, idx) => idx !== indexToRemove);
                      const primary = updatedList.length > 0 ? updatedList[0] : undefined;
                      const updated = { ...currentSite, drawingUrl: primary, drawings: updatedList };
                      setCurrentSite(updated);
                      saveSiteChanges(updated);
                    };

                    return (
                      <div className="space-y-3">
                        {/* 登録済み図面一覧リスト */}
                        {currentDrawings.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                              <span>登録済み施工図面 ({currentDrawings.length}件)</span>
                              <span className="text-[10px] text-slate-400">クリックでPDFビューアー閲覧</span>
                            </div>
                            <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                              {currentDrawings.map((dwPath, idx) => {
                                const norm = normalizeDrawingPath(dwPath);
                                const dwFileName = norm.split('/').pop() || norm;
                                return (
                                  <div
                                    key={`dw-${idx}-${norm}`}
                                    className="p-2.5 bg-white border border-slate-200 hover:border-indigo-300 rounded-xl flex items-center justify-between gap-2 shadow-2xs transition-all"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <span className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                                        {idx + 1}
                                      </span>
                                      <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                                      <span className="font-mono text-xs font-bold text-slate-800 truncate" title={norm}>
                                        {dwFileName}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPreviewFile({
                                            id: `drawing-${idx}-${Date.now()}`,
                                            name: dwFileName,
                                            url: appendAuthTokenToUrl(`${API_BASE_URL}/sites/drawings/serve?path=${encodeURIComponent(norm)}`),
                                            type: 'pdf',
                                            size: 'NAS施工図PDF',
                                          });
                                          setIsPreviewOpen(true);
                                        }}
                                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
                                        title="PDFビューアーで閲覧"
                                      >
                                        <Eye className="w-3 h-3" />
                                        <span>閲覧</span>
                                      </button>
                                      <a
                                        href={appendAuthTokenToUrl(`${API_BASE_URL}/sites/drawings/serve?path=${encodeURIComponent(norm)}`)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[11px] transition-colors border border-slate-200 cursor-pointer"
                                        title="ダウンロード / 別タブ表示"
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveDrawing(idx)}
                                        className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                                        title="この図面を削除"
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

                        {/* 複数一括 D&D エリア */}
                        <div
                          onDragOver={(e) => { e.preventDefault(); setIsDragOverDrawing(true); }}
                          onDragLeave={() => setIsDragOverDrawing(false)}
                          onDrop={async (e) => {
                            e.preventDefault();
                            setIsDragOverDrawing(false);
                            if (!currentSite) return;

                            const newPaths: string[] = [];
                            const errors: string[] = [];
                            const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
                            const droppedText = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text') || e.dataTransfer.getData('text/uri-list');

                            if (files.length > 0) {
                              for (const file of files) {
                                const fileName = file.name;
                                if (!fileName) continue;
                                const check = await validateAndResolveDrawingPath(fileName);
                                if (check.valid && check.resolvedPath) {
                                  newPaths.push(check.resolvedPath);
                                } else if (check.error) {
                                  errors.push(check.error);
                                }
                              }
                            } else if (droppedText) {
                              const lines = droppedText.split(/[\r\n,;]+/).map(s => s.trim()).filter(Boolean);
                              for (const line of lines) {
                                const check = await validateAndResolveDrawingPath(line);
                                if (check.valid && check.resolvedPath) {
                                  newPaths.push(check.resolvedPath);
                                } else if (check.error) {
                                  errors.push(check.error);
                                }
                              }
                            }

                            if (errors.length > 0) {
                              setDrawingErrorModal(errors.join('\n\n'));
                            }

                            if (newPaths.length > 0) {
                              const merged = Array.from(new Set([...currentDrawings, ...newPaths]));
                              const primary = merged[0];
                              const updated = { ...currentSite, drawingUrl: primary, drawings: merged };
                              setCurrentSite(updated);
                              saveSiteChanges(updated);
                            }
                          }}
                          className={`p-3 rounded-xl border-2 border-dashed transition-all text-center ${
                            isDragOverDrawing
                              ? 'border-indigo-500 bg-indigo-50/80 ring-2 ring-indigo-500/20 shadow-md'
                              : 'border-slate-300 bg-white hover:border-slate-400'
                          }`}
                        >
                          <div className="py-0.5 space-y-0.5">
                            <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center mb-0.5 shadow-2xs">
                              <FileText className="w-3.5 h-3.5" />
                            </div>
                            <p className="text-xs font-bold text-slate-700">
                              施工図PDFをドラッグ＆ドロップ（複数一括対応）
                            </p>
                            <p className="text-[10px] text-slate-400">
                              PDFファイルをドロップして登録
                            </p>
                          </div>
                        </div>

                        {/* パス手動入力 / 複数貼り付け */}
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold block mb-0.5">
                            施工図パス追加（ファイル名またはパスを貼り付け）
                          </label>
                          <input
                            type="text"
                            placeholder="例: N-26-158S_いすゞ自動車.pdf (Enterで検索追加)"
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const val = (e.target as HTMLInputElement).value;
                                await handleAddPaths(val);
                                (e.target as HTMLInputElement).value = '';
                              }
                            }}
                            onBlur={async (e) => {
                              const val = e.target.value;
                              if (val.trim()) {
                                await handleAddPaths(val);
                                e.target.value = '';
                              }
                            }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* 右列: 申し送り・現場コメント */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 flex flex-col h-full min-h-[420px]">
                <h5 className="font-bold text-sm text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  <span>申し送り・現場コメント</span>
                </h5>

                <div className="space-y-3 flex-1 max-h-[400px] overflow-y-auto pr-1">
                  {(!currentSite.comments || currentSite.comments.length === 0) ? (
                    <div className="p-8 text-center text-xs text-slate-400 italic">
                      申し送り・コメントはまだありません。現場に関する連絡や特記事項を投稿してください。
                    </div>
                  ) : (
                    currentSite.comments.map(c => (
                      <div key={c.id} className="p-3 bg-white rounded-xl border border-slate-200 space-y-1 shadow-2xs">
                        <div className="flex items-center justify-between text-xs">
                          <button
                            type="button"
                            onClick={() => triggerOpenUserModal((c as any).user || c.userId || c.userName)}
                            className="font-bold text-slate-800 hover:text-indigo-600 hover:underline transition-colors cursor-pointer"
                            title="投稿者の社員詳細を表示"
                          >
                            {c.userName}
                          </button>
                          <span className="text-[10px] text-slate-400">
                            {new Date(c.createdAt).toLocaleString('ja-JP')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 whitespace-pre-wrap">{c.content}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* コメント投稿フォーム */}
                <form onSubmit={handleAddComment} className="flex gap-2 pt-2 border-t border-slate-200 mt-auto">
                  <input
                    type="text"
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    placeholder="現場への申し送り・連絡を入力..."
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingComment || !commentInput.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    投稿
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 1: ダッシュボード（現場詳細・写真・図面・施工担当・直近コメント） */}
          {activeTab === 'info' && (
            <SiteDashboardTab
              currentSite={currentSite}
              allUsers={allUsers}
              siteEvents={siteEvents}
              drawings={getSiteDrawingList(currentSite)}
              normalizeDrawingPath={normalizeDrawingPath}
              isImageAttachment={isImageAttachment}
              isEditingInfo={isEditingInfo}
              infoForm={infoForm}
              setInfoForm={setInfoForm}
              isSaving={isSaving}
              onStartEditInfo={handleStartEditInfo}
              onSaveInfo={handleSaveInfo}
              onCancelEditInfo={handleCancelEditInfo}
              commentInput={commentInput}
              onCommentInputChange={setCommentInput}
              isSubmittingComment={isSubmittingComment}
              onAddComment={handleAddComment}
              onSwitchTab={(tab, options) => {
                setActiveTab(tab);
                if (options?.openInventoryLinker) {
                  setShowInventoryLinker(true);
                }
              }}
              onOpenPreview={(file) => {
                setPreviewFile(file);
                setIsPreviewOpen(true);
              }}
              onOpenCalendarEvent={(eventId, date, targetUser) => {
                if (onNavigateToCalendar) {
                  onClose();
                  onNavigateToCalendar(eventId, date, targetUser);
                }
              }}
              onDeleteSite={handleDelete}
            />
          )}

          {/* TAB 4: 自主検査書・Excel */}
          {activeTab === 'export' && (
            <SiteSelfInspectionTab
              currentSite={currentSite}
              currentUser={currentUser}
              offices={offices}
              liveSubParts={subParts}
            />
          )}

          {/* TAB 5: 施工スケジュール・実績タイムライン */}
          {activeTab === 'schedule' && (
            <div className="space-y-4">
              {/* 竣工予定・カウントダウンサマリー */}
              <div className="p-4 bg-gradient-to-r from-indigo-50/80 via-purple-50/80 to-blue-50/80 rounded-2xl border border-indigo-200/80 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="font-extrabold text-sm text-slate-900">竣工予定 & 工期管理</h5>
                      <p className="text-[11px] text-slate-500">現場の着工日・施工日・完工予定日とカウントダウン状況</p>
                    </div>
                  </div>

                  {/* カウントダウンバッジ */}
                  {(() => {
                    if (currentSite.status === 'completed') {
                      return (
                        <span className="px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-xs font-black flex items-center gap-1 shadow-2xs">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          全施工完了
                        </span>
                      );
                    }
                    const targetDateStr = currentSite.endDate || currentSite.constructionDate;
                    if (!targetDateStr) {
                      return (
                        <span className="px-3 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-xs font-bold">
                          完工予定日未設定
                        </span>
                      );
                    }
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const target = new Date(`${targetDateStr}T00:00:00+09:00`);
                    const diffTime = target.getTime() - today.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays > 0) {
                      return (
                        <span className="px-3.5 py-1 bg-indigo-600 text-white rounded-full text-xs font-black shadow-xs flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          完工予定まであと <span className="text-sm font-mono">{diffDays}</span> 日
                        </span>
                      );
                    } else if (diffDays === 0) {
                      return (
                        <span className="px-3.5 py-1 bg-amber-500 text-white rounded-full text-xs font-black shadow-xs animate-pulse flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          本日完工予定日
                        </span>
                      );
                    } else {
                      return (
                        <span className="px-3 py-1 bg-rose-100 text-rose-800 border border-rose-300 rounded-full text-xs font-black flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          完工予定から <span className="font-mono">{Math.abs(diffDays)}</span> 日経過
                        </span>
                      );
                    }
                  })()}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div className="p-3 bg-white/90 backdrop-blur-xs rounded-xl border border-slate-200 text-xs shadow-2xs">
                    <div className="text-[10px] text-slate-400 font-bold mb-0.5">着工日</div>
                    <div className="font-bold font-mono text-slate-800">{currentSite.startDate || '未設定'}</div>
                  </div>
                  <div className="p-3 bg-white/90 backdrop-blur-xs rounded-xl border border-indigo-200 text-xs shadow-2xs">
                    <div className="text-[10px] text-indigo-600 font-bold mb-0.5">主な施工日</div>
                    <div className="font-extrabold font-mono text-indigo-900">{currentSite.constructionDate || '未設定'}</div>
                  </div>
                  <div className="p-3 bg-white/90 backdrop-blur-xs rounded-xl border border-slate-200 text-xs shadow-2xs">
                    <div className="text-[10px] text-slate-400 font-bold mb-0.5">完工予定日</div>
                    <div className="font-bold font-mono text-slate-800">{currentSite.endDate || '未設定'}</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200/80 rounded-xl">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                    <HardHat className="w-4 h-4 text-amber-600" />
                    <span>現場施工スケジュール・施工実績</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-mono tabular-nums">
                      計 {siteEvents.length} 件
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    カレンダーの工事予定で本現場が紐付けられたスケジュールです。ここから工務メンバーを指定して直接スケジュール登録できます。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingScheduleEvent(null);
                    setIsScheduleModalOpen(true);
                  }}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>施工予定を登録</span>
                </button>
              </div>

              {siteEvents.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl space-y-3">
                  <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div>
                    <h5 className="font-bold text-sm text-slate-800">施工スケジュールはまだ登録されていません</h5>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                      下のボタンから「{currentSite.siteName}」の施工日時・担当メンバー（工務初期フィルタ済）を指定して直接登録できます。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingScheduleEvent(null);
                      setIsScheduleModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    <span>施工予定を登録する</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {siteEvents.map((evt, idx) => {
                    const startDate = new Date(evt.start);
                    const endDate = evt.end ? new Date(evt.end) : null;
                    const isPast = startDate.getTime() < Date.now();
                    const phase = evt.constructionPhase || (
                      evt.title.includes('新規') ? 'new' :
                      evt.title.includes('出庫') ? 'shukko' :
                      evt.title.includes('残') ? 'remaining' : undefined
                    );

                    const attendees = (evt.attendees && evt.attendees.length > 0)
                      ? evt.attendees
                      : (evt.createdBy ? [evt.createdBy] : []);

                    const dateDisplay = startDate.toLocaleDateString('ja-JP', {
                      timeZone: 'Asia/Tokyo',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      weekday: 'short'
                    });

                    const timeDisplay = evt.isAllDay
                      ? '終日'
                      : `${startDate.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}${
                          endDate ? ` 〜 ${endDate.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}` : ''
                        }`;

                    return (
                      <div
                        key={evt.id || idx}
                        className="p-4 bg-white border border-slate-200 hover:border-indigo-300 rounded-xl shadow-2xs hover:shadow-xs transition-all space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* 乗り込み種別バッジ */}
                            {phase === 'new' && (
                              <span className="px-2.5 py-0.5 rounded-md text-xs font-black bg-emerald-600 text-white shadow-2xs">
                                【新規乗り込み】
                              </span>
                            )}
                            {phase === 'remaining' && (
                              <span className="px-2.5 py-0.5 rounded-md text-xs font-black bg-amber-500 text-white shadow-2xs">
                                【残工事】
                              </span>
                            )}
                            {phase === 'shukko' && (
                              <span className="px-2.5 py-0.5 rounded-md text-xs font-black bg-indigo-600 text-white shadow-2xs">
                                【出庫有】
                              </span>
                            )}
                            {!phase && (
                              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                工事
                              </span>
                            )}

                            {/* 状態バッジ */}
                            {isPast ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                施工済（実績）
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                施工予定
                              </span>
                            )}

                            <span className="font-extrabold text-sm text-slate-900">
                              {evt.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                            <Clock className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{dateDisplay} {timeDisplay}</span>
                          </div>
                        </div>

                        {/* 施工担当者 */}
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-slate-400 font-semibold flex items-center gap-1">
                              <UserIcon className="w-3.5 h-3.5" />
                              <span>施工担当者:</span>
                            </span>
                            {attendees.length > 0 ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                {attendees.map(u => (
                                  <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => triggerOpenUserModal(u)}
                                    className="flex items-center gap-1.5 bg-slate-50 hover:bg-indigo-50 px-2 py-0.5 rounded-full border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer group/att"
                                    title={`${u.name} さんの社員詳細を表示`}
                                  >
                                    <img
                                      src={getAvatarUrl(u.avatarUrl)}
                                      onError={handleAvatarError}
                                      alt={u.name}
                                      className="w-4 h-4 rounded-full object-cover"
                                    />
                                    <span className="font-bold text-slate-800 group-hover/att:text-indigo-700">{u.name}</span>
                                    {u.department && (
                                      <span className="text-[10px] text-slate-400">({u.department})</span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400">未指定</span>
                            )}
                          </div>

                          {evt.location && (
                            <div className="flex items-center gap-1 text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                              <MapPin className="w-3 h-3 text-rose-500" />
                              <span>{evt.location}</span>
                            </div>
                          )}
                        </div>

                        {evt.memo && (
                          <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 whitespace-pre-wrap">
                            {evt.memo}
                          </div>
                        )}

                        {/* カレンダー遷移・編集アクション */}
                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                          {!evt.isIcal && onUpdateEvent && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingScheduleEvent(evt);
                                setIsScheduleModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                              title="この施工予定を編集"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                              <span>編集</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (onNavigateToCalendar) {
                                const firstAtt = attendees[0];
                                const evtUser =
                                  (firstAtt &&
                                    allUsers.find(
                                      u =>
                                        String(u.id) === String(firstAtt.id) ||
                                        (firstAtt.name && u.name === firstAtt.name)
                                    )) ||
                                  firstAtt ||
                                  allUsers.find(
                                    u =>
                                      (currentSite.primaryWorkerId && String(u.id) === String(currentSite.primaryWorkerId)) ||
                                      (currentSite.primaryWorkerName && u.name === currentSite.primaryWorkerName)
                                  );
                                onClose();
                                onNavigateToCalendar(evt.id, evt.start, evtUser);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 shadow-2xs hover:shadow-xs transition-all cursor-pointer whitespace-nowrap"
                            title="該当担当者のチーム予定表に移動してこの予定を表示"
                          >
                            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                            <span>カレンダーで開く</span>
                            <ExternalLink className="w-3 h-3 text-indigo-600" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/80 rounded-b-2xl flex items-center justify-between text-xs text-slate-500">
          <span>最終更新: {new Date(currentSite.updatedAt).toLocaleString('ja-JP')}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-semibold transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>

      {/* 施工図エラーモーダル */}
      {drawingErrorModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-100 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-xl shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">施工図ファイル登録エラー</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed whitespace-pre-wrap font-mono">
                  {drawingErrorModal}
                </p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDrawingErrorModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer transition-all active:scale-95 shadow-md"
              >
                OK（確認）
              </button>
            </div>
          </div>
        </div>
      )}

      {previewFile && (
        <FilePreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          file={previewFile}
        />
      )}

      <ConfirmModal
        {...confirmModal}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* 施工スケジュール新規登録・編集モーダル（EventModal流用・工務メンバー初期フィルタ） */}
      <EventModal
        isOpen={isScheduleModalOpen}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setEditingScheduleEvent(null);
        }}
        onSave={async (eventData, scope, originalInstanceDate) => {
          const isEditingExisting = Boolean('id' in eventData && eventData.id);
          if (isEditingExisting) {
            if (onUpdateEvent) {
              await onUpdateEvent(eventData as CalendarEvent, scope, originalInstanceDate);
            }
          } else if (onAddEvent) {
            await onAddEvent(eventData as Omit<CalendarEvent, 'id'>);
          } else {
            try {
              const payload = {
                ...eventData,
                category: eventData.type,
                startAt: eventData.start,
                endAt: eventData.end || eventData.start,
                isAllDay: eventData.isAllDay ? 1 : 0,
                createdBy: eventData.createdBy || currentUser,
                createdById: (eventData.createdBy || currentUser)?.id,
                userId: (eventData.createdBy || currentUser)?.id,
              };
              const res = await fetch(`${API_BASE_URL}/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              if (res.ok) {
                const json = await res.json();
                const savedEvent: CalendarEvent = json.event || {
                  ...(eventData as Omit<CalendarEvent, 'id'>),
                  id: String(json.id || `e-site-${Date.now()}`),
                  createdBy: eventData.createdBy || currentUser,
                };
                setFetchedEvents((prev) => [...prev, savedEvent]);
              }
            } catch (err) {
              console.error('Failed to save site schedule event:', err);
            }
          }
          setIsScheduleModalOpen(false);
          setEditingScheduleEvent(null);
        }}
        onDelete={onDeleteEvent}
        editingEvent={editingScheduleEvent}
        defaultType="construction"
        defaultSite={currentSite}
        defaultInitialDate={(() => {
          const cd = (currentSite.constructionDate || '').trim().slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(cd)) return undefined;
          const todayJst = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date());
          return cd >= todayJst ? cd : undefined;
        })()}
        defaultIsAllDay={false}
        defaultDivisionFilter="工務"
        defaultMemberSelectorExpanded={true}
        zIndexClass="z-[60]"
        offices={offices}
        divisions={divisions}
        allUsers={allUsers}
        currentUser={currentUser}
        sites={sites.length > 0 ? sites : [currentSite]}
        allEvents={(events && events.length > 0) ? events : fetchedEvents}
      />
    </div>
  );
};
