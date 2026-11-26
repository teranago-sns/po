import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Clock,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  HardHat,
  Image as ImageIcon,
  Layers,
  MessageSquare,
  Paperclip,
  Save,
  Send,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { Site, SiteAttachment, SiteComment, SiteStatus } from '../../types/site';
import { AttachmentFile, CalendarEvent, User } from '../../types';
import { API_BASE_URL, appendAuthTokenToUrl } from '../../config/api';
import { resolveFileUrl } from '../../utils/fileUpload';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';
import { triggerOpenUserModal } from '../../utils/userModal';

interface SiteDashboardTabProps {
  currentSite: Site;
  allUsers: User[];
  siteEvents: CalendarEvent[];
  drawings: string[];
  normalizeDrawingPath: (rawPath?: string, siteName?: string) => string;
  isImageAttachment: (att: { url?: string; name?: string }) => boolean;
  // 現場詳細編集
  isEditingInfo: boolean;
  infoForm: Partial<Site>;
  setInfoForm: React.Dispatch<React.SetStateAction<Partial<Site>>>;
  isSaving: boolean;
  onStartEditInfo: () => void;
  onSaveInfo: () => void;
  onCancelEditInfo: () => void;
  // コメント投稿
  commentInput: string;
  onCommentInputChange: (val: string) => void;
  isSubmittingComment: boolean;
  onAddComment: (e: React.FormEvent) => void;
  // ナビゲーション・アクション
  onSwitchTab: (tab: 'parts' | 'timeline' | 'schedule' | 'info' | 'export', options?: { openInventoryLinker?: boolean }) => void;
  onOpenPreview: (file: AttachmentFile) => void;
  onOpenCalendarEvent: (eventId: string, date?: string, targetUser?: User) => void;
  onDeleteSite: () => void;
}

type SectionKey = 'details' | 'media' | 'workers' | 'comments';

interface AggregatedWorker {
  key: string;
  user?: User;
  id?: string;
  name: string;
  department?: string;
  avatarUrl?: string;
  isCoWorker: boolean;
  partCount: number;
  eventCount: number;
}

/** JST (Asia/Tokyo) 基準で YYYY-MM-DD の当日日付文字列を返す */
function getTodayJstDateStr(): string {
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

/** JST 基準で 2つの YYYY-MM-DD 間の日数差（target - base）を算出 */
function diffJstDays(targetDateStr?: string): number | null {
  if (!targetDateStr) return null;
  const cleaned = targetDateStr.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return null;
  const todayStr = getTodayJstDateStr();
  const baseMs = new Date(`${todayStr}T00:00:00+09:00`).getTime();
  const targetMs = new Date(`${cleaned}T00:00:00+09:00`).getTime();
  if (Number.isNaN(baseMs) || Number.isNaN(targetMs)) return null;
  return Math.round((targetMs - baseMs) / (1000 * 60 * 60 * 24));
}

function formatJstDateTime(isoStr?: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(size?: number | string): string {
  if (typeof size === 'number') {
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return size || '';
}

const SITE_STATUS_LABEL: Record<SiteStatus, string> = {
  not_started: '未着手',
  in_progress: '施工進行中',
  completed: '全施工完了',
  on_hold: '保留',
};

const SITE_STATUS_COLOR: Record<SiteStatus, string> = {
  not_started: 'text-slate-600',
  in_progress: 'text-indigo-700',
  completed: 'text-emerald-700',
  on_hold: 'text-rose-700',
};

export const SiteDashboardTab: React.FC<SiteDashboardTabProps> = ({
  currentSite,
  allUsers,
  siteEvents,
  drawings,
  normalizeDrawingPath,
  isImageAttachment,
  isEditingInfo,
  infoForm,
  setInfoForm,
  isSaving,
  onStartEditInfo,
  onSaveInfo,
  onCancelEditInfo,
  commentInput,
  onCommentInputChange,
  isSubmittingComment,
  onAddComment,
  onSwitchTab,
  onOpenPreview,
  onOpenCalendarEvent,
  onDeleteSite,
}) => {
  // 初期開閉状態の算出（現場詳細は常に展開、それ以外は情報がない場合折りたたむ）
  const computeInitialOpenSections = (): Record<SectionKey, boolean> => {
    const hasInitialMedia =
      (currentSite.attachments?.length || 0) > 0 || drawings.length > 0;
    const hasInitialWorkers = Boolean(
      (currentSite.coWorkers && currentSite.coWorkers.length > 0) ||
        (currentSite.mainParts || []).some((p) => p.workerId || p.workerName) ||
        siteEvents.length > 0
    );
    const hasInitialComments = (currentSite.comments?.length || 0) > 0;
    return {
      details: true,
      media: hasInitialMedia,
      workers: hasInitialWorkers,
      comments: hasInitialComments,
    };
  };

  // セクション開閉トグル状態（現場詳細以外は情報がないセクションを閉じた状態で初期表示）
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(
    computeInitialOpenSections
  );

  // サブトグル状態
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [showScheduleList, setShowScheduleList] = useState(() => siteEvents.length > 0);
  const [brokenPhotoIds, setBrokenPhotoIds] = useState<Record<string, boolean>>({});

  // ユーザーの手動トグル操作を記録（手動操作後は自動開閉で上書きしない）
  const manualSectionsRef = useRef<Partial<Record<SectionKey, boolean>>>({});
  const manualScheduleRef = useRef(false);
  const prevSiteIdRef = useRef(currentSite.id);

  // スクロールアンカー参照
  const sectionRefs = {
    details: useRef<HTMLDivElement>(null),
    media: useRef<HTMLDivElement>(null),
    workers: useRef<HTMLDivElement>(null),
    comments: useRef<HTMLDivElement>(null),
  };

  const toggleSection = (key: SectionKey) => {
    manualSectionsRef.current[key] = true;
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allExpanded = Object.values(openSections).every(Boolean);
  const allCollapsed = Object.values(openSections).every((v) => !v);

  const expandAll = () => {
    manualSectionsRef.current = { details: true, media: true, workers: true, comments: true };
    setOpenSections({ details: true, media: true, workers: true, comments: true });
  };
  const collapseAll = () => {
    manualSectionsRef.current = { details: true, media: true, workers: true, comments: true };
    setOpenSections({ details: false, media: false, workers: false, comments: false });
  };

  const jumpToSection = (key: SectionKey) => {
    manualSectionsRef.current[key] = true;
    setOpenSections((prev) => ({ ...prev, [key]: true }));
    requestAnimationFrame(() => {
      sectionRefs[key].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // 写真とその他添付ファイルの分離
  const { photos, otherAttachments } = useMemo(() => {
    const all = currentSite.attachments || [];
    const imgList: SiteAttachment[] = [];
    const otherList: SiteAttachment[] = [];
    for (const att of all) {
      if (isImageAttachment(att)) {
        imgList.push(att);
      } else {
        otherList.push(att);
      }
    }
    return { photos: imgList, otherAttachments: otherList };
  }, [currentSite.attachments, isImageAttachment]);

  // 主要部品進捗集計
  const partsStats = useMemo(() => {
    const total = currentSite.mainParts?.length || 0;
    const completed = (currentSite.mainParts || []).filter(
      (p) => p.status === 'constructed' || p.status === 'inspected'
    ).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pct };
  }, [currentSite.mainParts]);

  // 完工予定までの残日数（JST基準）
  const endDateCountdown = useMemo(() => {
    const diff = diffJstDays(currentSite.endDate);
    if (diff === null) return null;
    if (currentSite.status === 'completed') {
      return { text: '完工済', tone: 'text-emerald-700' };
    }
    if (diff === 0) return { text: '本日完工予定', tone: 'text-amber-700' };
    if (diff > 0) return { text: `完工まであと ${diff}日`, tone: diff <= 7 ? 'text-amber-700' : 'text-slate-500' };
    return { text: `完工予定から ${Math.abs(diff)}日経過`, tone: 'text-rose-600' };
  }, [currentSite.endDate, currentSite.status]);

  // 施工担当メンバー統合リスト（同行者 + 部品担当 + 施工予定参加者 ※主担当施工者は現場詳細と重複するため除外）
  const workers = useMemo<AggregatedWorker[]>(() => {
    const map = new Map<string, AggregatedWorker>();

    const findMatchedUser = (id?: string, name?: string): User | undefined => {
      if (id) {
        const byId = allUsers.find((u) => String(u.id) === String(id));
        if (byId) return byId;
      }
      if (name) {
        const trimmed = name.trim();
        const byName = allUsers.find((u) => u.name.trim() === trimmed);
        if (byName) return byName;
      }
      return undefined;
    };

    const upsert = (params: {
      id?: string;
      name?: string;
      userObj?: User;
      isCoWorker?: boolean;
      addPart?: number;
      addEvent?: number;
    }) => {
      const matched = params.userObj || findMatchedUser(params.id, params.name);
      const displayName = (matched?.name || params.name || '').trim();
      const uid = matched?.id || params.id;
      if (!displayName && !uid) return;

      const key = uid ? `id:${String(uid)}` : `name:${displayName}`;
      const existing = map.get(key);
      if (existing) {
        if (params.isCoWorker) existing.isCoWorker = true;
        if (params.addPart) existing.partCount += params.addPart;
        if (params.addEvent) existing.eventCount += params.addEvent;
        if (!existing.user && matched) {
          existing.user = matched;
          existing.avatarUrl = matched.avatarUrl;
          existing.department = matched.department;
        }
      } else {
        map.set(key, {
          key,
          user: matched,
          id: uid,
          name: displayName || String(uid),
          department: matched?.department,
          avatarUrl: matched?.avatarUrl,
          isCoWorker: Boolean(params.isCoWorker),
          partCount: params.addPart || 0,
          eventCount: params.addEvent || 0,
        });
      }
    };

    // 1. 同行者
    for (const cw of currentSite.coWorkers || []) {
      if (typeof cw === 'string') {
        const trimmed = (cw as string).trim();
        if (trimmed) upsert({ name: trimmed, isCoWorker: true });
      } else if (cw && (cw.id || cw.name)) {
        upsert({ id: cw.id, name: cw.name, isCoWorker: true });
      }
    }

    // 2. 主要部品の担当者
    for (const part of currentSite.mainParts || []) {
      if (part.workerId || part.workerName) {
        upsert({
          id: part.workerId,
          name: part.workerName,
          addPart: 1,
        });
      }
    }

    // 3. 施工予定（カレンダー）の参加者
    for (const evt of siteEvents) {
      const attendees =
        evt.attendees && evt.attendees.length > 0
          ? evt.attendees
          : evt.createdBy
            ? [evt.createdBy]
            : [];
      for (const att of attendees) {
        upsert({
          id: att.id,
          name: att.name,
          userObj: att,
          addEvent: 1,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.partCount !== b.partCount) return b.partCount - a.partCount;
      if (a.eventCount !== b.eventCount) return b.eventCount - a.eventCount;
      return a.name.localeCompare(b.name, 'ja');
    });
  }, [currentSite.coWorkers, currentSite.mainParts, siteEvents, allUsers]);

  // コメント最新順ソート
  const sortedComments = useMemo<SiteComment[]>(() => {
    const list = currentSite.comments || [];
    return [...list].sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });
  }, [currentSite.comments]);

  const visiblePhotos = showAllPhotos ? photos : photos.slice(0, 8);
  const visibleComments = showAllComments ? sortedComments : sortedComments.slice(0, 5);

  const hasMediaData = photos.length > 0 || drawings.length > 0 || otherAttachments.length > 0;
  const hasWorkersData = workers.length > 0 || siteEvents.length > 0;
  const hasCommentsData = sortedComments.length > 0;

  // 別の現場へ切り替えた際に初期開閉状態をリセットし、非同期読み込みで情報が到着した場合も未操作なら自動展開
  useEffect(() => {
    if (prevSiteIdRef.current !== currentSite.id) {
      prevSiteIdRef.current = currentSite.id;
      manualSectionsRef.current = {};
      manualScheduleRef.current = false;
      setOpenSections({
        details: true,
        media: hasMediaData,
        workers: hasWorkersData,
        comments: hasCommentsData,
      });
      setShowScheduleList(siteEvents.length > 0);
      return;
    }

    setOpenSections((prev) => {
      const next = { ...prev };
      let changed = false;
      if (!manualSectionsRef.current.media && hasMediaData && !prev.media) {
        next.media = true;
        changed = true;
      }
      if (!manualSectionsRef.current.workers && hasWorkersData && !prev.workers) {
        next.workers = true;
        changed = true;
      }
      if (!manualSectionsRef.current.comments && hasCommentsData && !prev.comments) {
        next.comments = true;
        changed = true;
      }
      return changed ? next : prev;
    });

    if (!manualScheduleRef.current && siteEvents.length > 0) {
      setShowScheduleList(true);
    }
  }, [currentSite.id, hasMediaData, hasWorkersData, hasCommentsData, siteEvents.length]);

  const handleOpenPrimaryCalendar = () => {
    const primaryUser = allUsers.find(
      (u) =>
        (currentSite.primaryWorkerId && String(u.id) === String(currentSite.primaryWorkerId)) ||
        (currentSite.primaryWorkerName && u.name === currentSite.primaryWorkerName)
    );
    onOpenCalendarEvent('', currentSite.constructionDate || currentSite.startDate, primaryUser);
  };

  return (
    <div className="space-y-4">
      {/* 上部サマリーKPIストリップ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: 主要部品進捗 */}
        <button
          type="button"
          onClick={() => onSwitchTab('parts')}
          className="text-left p-3.5 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer group"
        >
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              主要部品進捗
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-lg font-extrabold text-slate-900 font-mono tabular-nums">
              {partsStats.completed}
              <span className="text-xs font-semibold text-slate-400"> / {partsStats.total}台</span>
            </span>
            <span className="text-xs font-bold font-mono tabular-nums text-indigo-700">
              {partsStats.pct}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${partsStats.pct}%` }}
            />
          </div>
        </button>

        {/* KPI 2: 工期・完工予定 */}
        <button
          type="button"
          onClick={() => onSwitchTab('schedule')}
          className="text-left p-3.5 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer group"
        >
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-600" />
              完工予定
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
          </div>
          <div className="mt-1.5 text-lg font-extrabold text-slate-900 font-mono tabular-nums truncate">
            {currentSite.endDate || '未定'}
          </div>
          <div className={`mt-1 text-[11px] font-semibold truncate ${endDateCountdown?.tone || 'text-slate-400'}`}>
            {endDateCountdown
              ? endDateCountdown.text
              : currentSite.startDate
                ? `着工 ${currentSite.startDate}`
                : '工期未登録'}
          </div>
        </button>

        {/* KPI 3: 写真・施工図面 */}
        <button
          type="button"
          onClick={() => jumpToSection('media')}
          className="text-left p-3.5 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer group"
        >
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
              写真・施工図面
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-3 font-mono tabular-nums">
            <span className="text-lg font-extrabold text-slate-900">
              {photos.length}
              <span className="text-[11px] font-sans font-semibold text-slate-500 ml-0.5">写真</span>
            </span>
            <span className="text-slate-300">/</span>
            <span className="text-lg font-extrabold text-slate-900">
              {drawings.length}
              <span className="text-[11px] font-sans font-semibold text-slate-500 ml-0.5">図面</span>
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 truncate">
            {otherAttachments.length > 0 ? `他添付 ${otherAttachments.length}件` : 'クリックで一覧を表示'}
          </div>
        </button>

        {/* KPI 4: 施工担当・コメント */}
        <button
          type="button"
          onClick={() => jumpToSection('workers')}
          className="text-left p-3.5 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer group"
        >
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5">
              <HardHat className="w-3.5 h-3.5 text-slate-600" />
              施工担当・申し送り
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-3 font-mono tabular-nums">
            <span className="text-lg font-extrabold text-slate-900">
              {workers.length}
              <span className="text-[11px] font-sans font-semibold text-slate-500 ml-0.5">名</span>
            </span>
            <span className="text-slate-300">/</span>
            <span className="text-lg font-extrabold text-slate-900">
              {sortedComments.length}
              <span className="text-[11px] font-sans font-semibold text-slate-500 ml-0.5">コメント</span>
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 truncate">
            施工予定・実績 {siteEvents.length}件
          </div>
        </button>
      </div>

      {/* セクション表示トグル・クイックコントロールバー */}
      <div className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500 mr-1 whitespace-nowrap">表示セクション:</span>
          {(
            [
              { key: 'details', label: '現場詳細' },
              { key: 'media', label: `写真・図面 (${photos.length + drawings.length})` },
              { key: 'workers', label: `施工担当 (${workers.length})` },
              { key: 'comments', label: `コメント (${sortedComments.length})` },
            ] as { key: SectionKey; label: string }[]
          ).map((item) => {
            const isOpen = openSections[item.key];
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleSection(item.key)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                  isOpen
                    ? 'bg-white text-indigo-700 border-indigo-200'
                    : 'bg-slate-100/70 text-slate-500 border-slate-200 hover:bg-white hover:text-slate-700'
                }`}
                aria-expanded={isOpen}
              >
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-150 ${isOpen ? 'rotate-0' : '-rotate-90'}`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={expandAll}
            disabled={allExpanded}
            className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-indigo-700 hover:bg-white rounded-md border border-transparent hover:border-slate-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default whitespace-nowrap flex items-center gap-1"
          >
            <ChevronsDown className="w-3.5 h-3.5" />
            <span>すべて展開</span>
          </button>
          <span className="text-slate-300">|</span>
          <button
            type="button"
            onClick={collapseAll}
            disabled={allCollapsed}
            className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-indigo-700 hover:bg-white rounded-md border border-transparent hover:border-slate-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default whitespace-nowrap flex items-center gap-1"
          >
            <ChevronsUp className="w-3.5 h-3.5" />
            <span>すべて折りたたむ</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: 現場詳細情報 */}
      <div
        ref={sectionRefs.details}
        className="bg-white rounded-xl border border-slate-200 overflow-hidden"
      >
        <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => toggleSection('details')}
            className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer group"
            aria-expanded={openSections.details}
          >
            <ChevronDown
              className={`w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-transform duration-150 shrink-0 ${
                openSections.details ? 'rotate-0' : '-rotate-90'
              }`}
            />
            <Building className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="font-bold text-sm text-slate-900 whitespace-nowrap">現場詳細情報</span>
            {!openSections.details && (
              <span className="text-xs text-slate-500 truncate ml-1">
                {[
                  currentSite.siteCode ? `コード ${currentSite.siteCode}` : 'コード未連携',
                  currentSite.customerName || '元請未設定',
                  `EG ${currentSite.egCount}台`,
                  SITE_STATUS_LABEL[currentSite.status],
                ].join(' · ')}
              </span>
            )}
          </button>

          <div className="flex items-center gap-2 shrink-0">
            {!isEditingInfo ? (
              <button
                type="button"
                onClick={() => {
                  setOpenSections((prev) => ({ ...prev, details: true }));
                  onStartEditInfo();
                }}
                className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>編集</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onSaveInfo}
                  disabled={isSaving}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>保存</span>
                </button>
                <button
                  type="button"
                  onClick={onCancelEditInfo}
                  disabled={isSaving}
                  className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                >
                  キャンセル
                </button>
              </>
            )}
          </div>
        </div>

        {openSections.details && (
          <div className="p-4">
            {!isEditingInfo ? (
              <div className="space-y-4 text-xs">
                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3.5">
                  <div>
                    <dt className="text-[11px] font-semibold text-slate-500">現場コード</dt>
                    <dd className="mt-0.5 flex flex-wrap items-center gap-2">
                      {currentSite.siteCode ? (
                        <a
                          href={`https://sql.teranago.synology.me/genba?code=${encodeURIComponent(currentSite.siteCode.trim())}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-mono font-bold text-indigo-700 hover:text-indigo-900 hover:underline"
                          title={`現場コード「${currentSite.siteCode}」の外部データを新規ウインドウで開く`}
                        >
                          <span>{currentSite.siteCode}</span>
                          <ExternalLink className="w-3 h-3 text-indigo-500" />
                        </a>
                      ) : (
                        <span className="text-slate-400">未連携</span>
                      )}
                      <button
                        type="button"
                        onClick={() => onSwitchTab('parts', { openInventoryLinker: !currentSite.siteCode })}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer whitespace-nowrap"
                      >
                        {currentSite.siteCode ? '主要部品タブで同期' : '主要部品タブで連携 →'}
                      </button>
                    </dd>
                  </div>

                  <div>
                    <dt className="text-[11px] font-semibold text-slate-500">現場名</dt>
                    <dd className="mt-0.5 font-bold text-slate-900">{currentSite.siteName}</dd>
                  </div>

                  <div>
                    <dt className="text-[11px] font-semibold text-slate-500">元請 / 取引先</dt>
                    <dd className="mt-0.5 text-slate-800">{currentSite.customerName || '未設定'}</dd>
                  </div>

                  <div>
                    <dt className="text-[11px] font-semibold text-slate-500">図面番号</dt>
                    <dd className="mt-0.5 font-mono text-slate-800">{currentSite.orderNo || '未設定'}</dd>
                  </div>

                  <div>
                    <dt className="text-[11px] font-semibold text-slate-500">EG台数</dt>
                    <dd className="mt-0.5 font-bold font-mono tabular-nums text-indigo-700">
                      {currentSite.egCount} 台
                    </dd>
                  </div>

                  <div>
                    <dt className="text-[11px] font-semibold text-slate-500">主担当施工者</dt>
                    <dd className="mt-0.5">
                      {currentSite.primaryWorkerName || currentSite.primaryWorkerId ? (
                        <button
                          type="button"
                          onClick={() =>
                            triggerOpenUserModal(currentSite.primaryWorkerId || currentSite.primaryWorkerName)
                          }
                          className="font-bold text-slate-800 hover:text-indigo-600 hover:underline transition-colors cursor-pointer"
                          title="主担当施工者の社員詳細を表示"
                        >
                          {currentSite.primaryWorkerName}
                        </button>
                      ) : (
                        <span className="text-slate-400">未定</span>
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-[11px] font-semibold text-slate-500">工期（着工〜完工）</dt>
                    <dd className="mt-0.5 font-mono tabular-nums text-slate-800">
                      {currentSite.startDate || '未定'} 〜 {currentSite.endDate || '未定'}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-[11px] font-semibold text-slate-500">主な施工日</dt>
                    <dd className="mt-0.5 font-mono tabular-nums text-slate-800">
                      {currentSite.constructionDate || '未定'}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-[11px] font-semibold text-slate-500">全体進捗</dt>
                    <dd className={`mt-0.5 font-bold ${SITE_STATUS_COLOR[currentSite.status]}`}>
                      {SITE_STATUS_LABEL[currentSite.status]}
                    </dd>
                  </div>

                  <div className="sm:col-span-2 lg:col-span-3">
                    <dt className="text-[11px] font-semibold text-slate-500">施工場所 / 住所</dt>
                    <dd className="mt-0.5 text-slate-800">{currentSite.address || '未設定'}</dd>
                  </div>
                </dl>

                {currentSite.notes && (
                  <div className="pt-3 border-t border-slate-100">
                    <div className="text-[11px] font-semibold text-slate-500 mb-1">備考 / 特記事項</div>
                    <p className="text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50/70 p-3 rounded-lg border border-slate-100">
                      {currentSite.notes}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold text-slate-700">現場コード</label>
                      {(infoForm.siteCode || currentSite.siteCode) && (
                        <a
                          href={`https://sql.teranago.synology.me/genba?code=${encodeURIComponent(
                            (infoForm.siteCode || currentSite.siteCode || '').trim()
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          <span>外部確認</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                    <input
                      type="text"
                      value={infoForm.siteCode || ''}
                      onChange={(e) => setInfoForm((prev) => ({ ...prev, siteCode: e.target.value }))}
                      placeholder="未連携時は空欄可（在庫同期は「主要部品」タブから実行）"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-indigo-900 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">現場名</label>
                    <input
                      type="text"
                      value={infoForm.siteName || ''}
                      onChange={(e) => setInfoForm((prev) => ({ ...prev, siteName: e.target.value }))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">元請 / 取引先</label>
                    <input
                      type="text"
                      value={infoForm.customerName || ''}
                      onChange={(e) => setInfoForm((prev) => ({ ...prev, customerName: e.target.value }))}
                      placeholder="例: 株式会社〇〇建設"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">図面番号</label>
                    <input
                      type="text"
                      value={infoForm.orderNo || ''}
                      onChange={(e) => setInfoForm((prev) => ({ ...prev, orderNo: e.target.value }))}
                      placeholder="例: DRW-2026-001"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">施工場所 / 住所</label>
                  <input
                    type="text"
                    value={infoForm.address || ''}
                    onChange={(e) => setInfoForm((prev) => ({ ...prev, address: e.target.value }))}
                    placeholder="例: 東京都千代田区〇〇 1-2-3"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">EG台数</label>
                    <input
                      type="number"
                      min={1}
                      value={infoForm.egCount ?? 1}
                      onChange={(e) =>
                        setInfoForm((prev) => ({
                          ...prev,
                          egCount: Math.max(1, parseInt(e.target.value, 10) || 1),
                        }))
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">着工日</label>
                    <input
                      type="date"
                      value={infoForm.startDate || ''}
                      onChange={(e) => setInfoForm((prev) => ({ ...prev, startDate: e.target.value }))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">完工日</label>
                    <input
                      type="date"
                      value={infoForm.endDate || ''}
                      onChange={(e) => setInfoForm((prev) => ({ ...prev, endDate: e.target.value }))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">主な施工日</label>
                    <input
                      type="date"
                      value={infoForm.constructionDate || ''}
                      onChange={(e) => setInfoForm((prev) => ({ ...prev, constructionDate: e.target.value }))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">主担当施工者</label>
                    <select
                      value={infoForm.primaryWorkerId || ''}
                      onChange={(e) => {
                        const u = allUsers.find((x) => x.id === e.target.value);
                        setInfoForm((prev) => ({
                          ...prev,
                          primaryWorkerId: e.target.value,
                          primaryWorkerName: u?.name || '',
                        }));
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">未割り当て</option>
                      {allUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">全体進捗</label>
                    <select
                      value={infoForm.status || 'not_started'}
                      onChange={(e) => setInfoForm((prev) => ({ ...prev, status: e.target.value as SiteStatus }))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="not_started">未着手</option>
                      <option value="in_progress">施工進行中</option>
                      <option value="completed">全施工完了</option>
                      <option value="on_hold">保留</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">備考 / 特記事項</label>
                  <textarea
                    rows={2}
                    value={infoForm.notes || ''}
                    onChange={(e) => setInfoForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="特記事項や現場注意点を記入..."
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION 2: 登録写真・施工図面一覧 */}
      <div
        ref={sectionRefs.media}
        className="bg-white rounded-xl border border-slate-200 overflow-hidden"
      >
        <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => toggleSection('media')}
            className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer group"
            aria-expanded={openSections.media}
          >
            <ChevronDown
              className={`w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-transform duration-150 shrink-0 ${
                openSections.media ? 'rotate-0' : '-rotate-90'
              }`}
            />
            <ImageIcon className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="font-bold text-sm text-slate-900 whitespace-nowrap">登録写真・施工図面</span>
            <span className="text-xs text-slate-500 font-mono tabular-nums truncate">
              写真 {photos.length}枚 · 図面 {drawings.length}件
              {otherAttachments.length > 0 ? ` · 他 ${otherAttachments.length}件` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSwitchTab('timeline')}
            className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>登録・管理へ</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {openSections.media && (
          <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* 左: 登録写真ギャラリー */}
            <div className="lg:col-span-7 space-y-2.5">
              <div className="flex items-center justify-between">
                <h6 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                  <span>現場写真</span>
                  <span className="font-mono tabular-nums text-slate-400">({photos.length})</span>
                </h6>
                {photos.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setShowAllPhotos((prev) => !prev)}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer whitespace-nowrap"
                  >
                    {showAllPhotos ? '直近8枚のみ表示' : `すべて表示 (+${photos.length - 8}枚)`}
                  </button>
                )}
              </div>

              {photos.length === 0 ? (
                <div className="py-6 px-4 bg-slate-50/70 border border-dashed border-slate-200 rounded-lg text-center space-y-1.5">
                  <p className="text-xs text-slate-500">登録された現場写真はまだありません。</p>
                  <button
                    type="button"
                    onClick={() => onSwitchTab('timeline')}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                  >
                    施工図面・添付タブから写真を追加する →
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {visiblePhotos.map((att) => {
                    const fileUrl = resolveFileUrl(att.url);
                    const formattedSize = formatFileSize(att.size);
                    const formattedDate = formatJstDateTime(att.uploadedAt);
                    const isBroken = Boolean(brokenPhotoIds[att.id]);
                    return (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() =>
                          onOpenPreview({
                            id: att.id,
                            name: att.name,
                            url: fileUrl,
                            size: formattedSize,
                            type: 'image',
                          })
                        }
                        className="group relative aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-400 bg-slate-100 text-left transition-all cursor-pointer"
                        title={`${att.name}${formattedDate ? ` (${formattedDate})` : ''}`}
                      >
                        {isBroken ? (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-400 p-2">
                            <ImageIcon className="w-5 h-5" />
                            <span className="text-[10px] truncate max-w-full">{att.name}</span>
                          </div>
                        ) : (
                          <img
                            src={fileUrl}
                            alt={att.name}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            onError={() =>
                              setBrokenPhotoIds((prev) => ({ ...prev, [att.id]: true }))
                            }
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 via-slate-950/35 to-transparent px-2 py-1.5">
                          <div className="text-[10px] font-semibold text-white truncate">
                            {att.name}
                          </div>
                          {formattedDate && (
                            <div className="text-[9px] font-mono tabular-nums text-slate-200/90">
                              {formattedDate}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 右: 施工図面PDF + その他添付資料 */}
            <div className="lg:col-span-5 space-y-3">
              <div className="space-y-2">
                <h6 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>施工図面 PDF (02-施工図PDF)</span>
                  <span className="font-mono tabular-nums text-slate-400">({drawings.length})</span>
                </h6>

                {drawings.length === 0 ? (
                  <div className="py-5 px-4 bg-slate-50/70 border border-dashed border-slate-200 rounded-lg text-center space-y-1.5">
                    <p className="text-xs text-slate-500">登録された施工図面はありません。</p>
                    <button
                      type="button"
                      onClick={() => onSwitchTab('timeline')}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                    >
                      施工図面PDFを連携する →
                    </button>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-60 overflow-y-auto">
                    {drawings.map((dwPath, idx) => {
                      const norm = normalizeDrawingPath(dwPath);
                      const dwFileName = norm.split('/').pop() || norm;
                      const serveUrl = appendAuthTokenToUrl(
                        `${API_BASE_URL}/sites/drawings/serve?path=${encodeURIComponent(norm)}`
                      );
                      return (
                        <div
                          key={`dash-dw-${idx}-${norm}`}
                          className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors text-xs"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              onOpenPreview({
                                id: `dash-drawing-${idx}-${Date.now()}`,
                                name: dwFileName,
                                url: serveUrl,
                                type: 'pdf',
                                size: 'NAS施工図PDF',
                              })
                            }
                            className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer group"
                            title={`${norm} をPDFビューアーで開く`}
                          >
                            <span className="text-[11px] font-mono tabular-nums text-slate-400 w-4 shrink-0">
                              {idx + 1}.
                            </span>
                            <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                            <span className="font-mono font-semibold text-slate-800 group-hover:text-indigo-700 truncate">
                              {dwFileName}
                            </span>
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                onOpenPreview({
                                  id: `dash-drawing-${idx}-${Date.now()}`,
                                  name: dwFileName,
                                  url: serveUrl,
                                  type: 'pdf',
                                  size: 'NAS施工図PDF',
                                })
                              }
                              className="px-2 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 rounded-md flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                              title="PDFビューアーで閲覧"
                            >
                              <Eye className="w-3 h-3" />
                              <span>閲覧</span>
                            </button>
                            <a
                              href={serveUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                              title="ダウンロード / 別タブで開く"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {otherAttachments.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <h6 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                    <span>その他添付資料</span>
                    <span className="font-mono tabular-nums text-slate-400">({otherAttachments.length})</span>
                  </h6>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-y-auto">
                    {otherAttachments.map((att) => {
                      const fileUrl = resolveFileUrl(att.url);
                      const formattedSize = formatFileSize(att.size);
                      return (
                        <div
                          key={att.id}
                          className="px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-slate-50 text-xs"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              onOpenPreview({
                                id: att.id,
                                name: att.name,
                                url: fileUrl,
                                size: formattedSize,
                                type: (att as any).type || '',
                              })
                            }
                            className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer group"
                          >
                            <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="truncate font-medium text-slate-700 group-hover:text-indigo-700">
                              {att.name}
                            </span>
                            {formattedSize && (
                              <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                {formattedSize}
                              </span>
                            )}
                          </button>
                          <a
                            href={fileUrl}
                            download={att.name}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md shrink-0"
                            title="ダウンロード"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: 施工担当一覧・施工スケジュール */}
      <div
        ref={sectionRefs.workers}
        className="bg-white rounded-xl border border-slate-200 overflow-hidden"
      >
        <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => toggleSection('workers')}
            className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer group"
            aria-expanded={openSections.workers}
          >
            <ChevronDown
              className={`w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-transform duration-150 shrink-0 ${
                openSections.workers ? 'rotate-0' : '-rotate-90'
              }`}
            />
            <HardHat className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-bold text-sm text-slate-900 whitespace-nowrap">
              施工担当一覧・スケジュール
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums truncate">
              担当 {workers.length}名 · 予定・実績 {siteEvents.length}件
            </span>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleOpenPrimaryCalendar}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>カレンダー</span>
            </button>
            <button
              type="button"
              onClick={() => onSwitchTab('schedule')}
              className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>予定タブへ</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {openSections.workers && (
          <div className="p-4 space-y-4">
            {/* 施工担当メンバー一覧 */}
            {workers.length === 0 ? (
              <div className="py-5 px-4 bg-slate-50/70 border border-dashed border-slate-200 rounded-lg text-center text-xs text-slate-500">
                施工担当者はまだ割り当てられていません。主要部品の担当者設定、または「施工予定・実績」タブ／カレンダーから予定を登録すると一覧表示されます。
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {workers.map((w) => {
                  const roleParts: string[] = [];
                  if (w.isCoWorker) roleParts.push('同行');
                  if (w.partCount > 0) roleParts.push(`部品 ${w.partCount}台`);
                  if (w.eventCount > 0) roleParts.push(`予定 ${w.eventCount}件`);

                  return (
                    <button
                      key={w.key}
                      type="button"
                      onClick={() => triggerOpenUserModal(w.user || w.id || w.name)}
                      className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-slate-50/70 text-left transition-colors cursor-pointer group"
                      title={`${w.name} さんの社員詳細を表示`}
                    >
                      {w.avatarUrl || w.user ? (
                        <img
                          src={getAvatarUrl(w.avatarUrl)}
                          onError={handleAvatarError}
                          alt={w.name}
                          className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                          <UserIcon className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5 min-w-0">
                          <span className="font-bold text-xs text-slate-900 group-hover:text-indigo-700 truncate">
                            {w.name}
                          </span>
                          {w.department && (
                            <span className="text-[10px] text-slate-400 truncate">
                              {w.department}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                          {roleParts.length > 0 ? roleParts.join(' · ') : '施工担当'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 施工スケジュール（サブトグル） */}
            <div className="pt-3 border-t border-slate-100 space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  manualScheduleRef.current = true;
                  setShowScheduleList((prev) => !prev);
                }}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-indigo-700 transition-colors cursor-pointer"
                aria-expanded={showScheduleList}
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                    showScheduleList ? 'rotate-0' : '-rotate-90'
                  }`}
                />
                <span>施工スケジュール一覧</span>
                <span className="font-mono tabular-nums text-slate-400">({siteEvents.length}件)</span>
              </button>

              {showScheduleList && (
                siteEvents.length === 0 ? (
                  <div className="text-xs text-slate-400 py-2">
                    カレンダーに紐づく施工予定・実績はまだありません。
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {siteEvents.map((evt, idx) => {
                      const startDate = new Date(evt.start);
                      const endDate = evt.end ? new Date(evt.end) : null;
                      const isPast = startDate.getTime() < Date.now();
                      const phase =
                        evt.constructionPhase ||
                        (evt.title.includes('新規')
                          ? 'new'
                          : evt.title.includes('出庫')
                            ? 'shukko'
                            : evt.title.includes('残')
                              ? 'remaining'
                              : undefined);

                      const phaseLabel =
                        phase === 'new'
                          ? '新規乗り込み'
                          : phase === 'remaining'
                            ? '残工事'
                            : phase === 'shukko'
                              ? '出庫有'
                              : '工事';

                      const phaseTone =
                        phase === 'new'
                          ? 'text-emerald-700'
                          : phase === 'remaining'
                            ? 'text-amber-700'
                            : phase === 'shukko'
                              ? 'text-indigo-700'
                              : 'text-slate-600';

                      const attendees =
                        evt.attendees && evt.attendees.length > 0
                          ? evt.attendees
                          : evt.createdBy
                            ? [evt.createdBy]
                            : [];

                      const dateDisplay = startDate.toLocaleDateString('ja-JP', {
                        timeZone: 'Asia/Tokyo',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        weekday: 'short',
                      });

                      const timeDisplay = evt.isAllDay
                        ? '終日'
                        : `${startDate.toLocaleTimeString('ja-JP', {
                            timeZone: 'Asia/Tokyo',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}${
                            endDate
                              ? `〜${endDate.toLocaleTimeString('ja-JP', {
                                  timeZone: 'Asia/Tokyo',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}`
                              : ''
                          }`;

                      return (
                        <div
                          key={evt.id || idx}
                          className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/70 transition-colors text-xs"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="font-mono tabular-nums font-bold text-slate-800 whitespace-nowrap flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400" />
                                {dateDisplay} {timeDisplay}
                              </span>
                              <span className={`font-bold text-[11px] whitespace-nowrap ${phaseTone}`}>
                                {phaseLabel}
                              </span>
                              <span className="text-slate-300">·</span>
                              <span
                                className={`text-[11px] font-semibold whitespace-nowrap ${
                                  isPast ? 'text-slate-400' : 'text-blue-700'
                                }`}
                              >
                                {isPast ? '施工済' : '施工予定'}
                              </span>
                              <span className="font-bold text-slate-900 truncate">{evt.title}</span>
                            </div>

                            {attendees.length > 0 && (
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                                <span>担当:</span>
                                {attendees.map((u, uIdx) => (
                                  <React.Fragment key={u.id || uIdx}>
                                    <button
                                      type="button"
                                      onClick={() => triggerOpenUserModal(u)}
                                      className="font-semibold text-slate-700 hover:text-indigo-700 hover:underline cursor-pointer"
                                    >
                                      {u.name}
                                    </button>
                                    {uIdx < attendees.length - 1 && <span className="text-slate-300">/</span>}
                                  </React.Fragment>
                                ))}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const firstAtt = attendees[0];
                              const evtUser =
                                (firstAtt &&
                                  allUsers.find(
                                    (u) =>
                                      String(u.id) === String(firstAtt.id) ||
                                      (firstAtt.name && u.name === firstAtt.name)
                                  )) ||
                                firstAtt ||
                                allUsers.find(
                                  (u) =>
                                    (currentSite.primaryWorkerId &&
                                      String(u.id) === String(currentSite.primaryWorkerId)) ||
                                    (currentSite.primaryWorkerName && u.name === currentSite.primaryWorkerName)
                                );
                              onOpenCalendarEvent(evt.id, evt.start, evtUser);
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
                          >
                            <span>カレンダーで開く</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: 直近のコメント・申し送り */}
      <div
        ref={sectionRefs.comments}
        className="bg-white rounded-xl border border-slate-200 overflow-hidden"
      >
        <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => toggleSection('comments')}
            className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer group"
            aria-expanded={openSections.comments}
          >
            <ChevronDown
              className={`w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-transform duration-150 shrink-0 ${
                openSections.comments ? 'rotate-0' : '-rotate-90'
              }`}
            />
            <MessageSquare className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="font-bold text-sm text-slate-900 whitespace-nowrap">
              直近のコメント・申し送り
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums truncate">
              {sortedComments.length}件
              {sortedComments[0]?.createdAt ? ` · 最終 ${formatJstDateTime(sortedComments[0].createdAt)}` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSwitchTab('timeline')}
            className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>タイムラインへ</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {openSections.comments && (
          <div className="p-4 space-y-3">
            {sortedComments.length === 0 ? (
              <div className="py-5 px-4 bg-slate-50/70 border border-dashed border-slate-200 rounded-lg text-center text-xs text-slate-500">
                コメント・申し送りはまだありません。下のフォームから現場の状況を記録できます。
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {visibleComments.map((c) => {
                    const matchedUser = allUsers.find(
                      (u) => String(u.id) === String(c.userId) || u.name === c.userName
                    );
                    const avatarSrc = getAvatarUrl(matchedUser?.avatarUrl || c.userAvatar);
                    return (
                      <div key={c.id} className="p-3 flex items-start gap-2.5 text-xs">
                        <button
                          type="button"
                          onClick={() => triggerOpenUserModal(matchedUser || c.userId || c.userName)}
                          className="shrink-0 cursor-pointer mt-0.5"
                          title={`${c.userName} さんの社員詳細を表示`}
                        >
                          <img
                            src={avatarSrc}
                            onError={handleAvatarError}
                            alt={c.userName}
                            className="w-7 h-7 rounded-full object-cover border border-slate-200"
                          />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => triggerOpenUserModal(matchedUser || c.userId || c.userName)}
                              className="font-bold text-slate-900 hover:text-indigo-700 hover:underline cursor-pointer"
                            >
                              {c.userName}
                            </button>
                            <span className="text-[11px] font-mono tabular-nums text-slate-400">
                              {formatJstDateTime(c.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 text-slate-700 whitespace-pre-wrap leading-relaxed break-words">
                            {c.content}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {sortedComments.length > 5 && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShowAllComments((prev) => !prev)}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer whitespace-nowrap"
                    >
                      {showAllComments
                        ? '直近5件のみ表示に戻す'
                        : `すべてのコメントを表示 (全${sortedComments.length}件)`}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ダッシュボードから直接クイック投稿 */}
            <form onSubmit={onAddComment} className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={commentInput}
                onChange={(e) => onCommentInputChange(e.target.value)}
                placeholder="現場の申し送り・コメントをクイック投稿..."
                disabled={isSubmittingComment}
                className="flex-1 min-w-0 px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-400 rounded-lg text-xs text-slate-800 outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={isSubmittingComment || !commentInput.trim()}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>投稿</span>
              </button>
            </form>
          </div>
        )}
      </div>

      {/* フッター: 現場削除 */}
      <div className="pt-2 border-t border-slate-200 flex justify-end">
        <button
          type="button"
          onClick={onDeleteSite}
          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>この現場を削除</span>
        </button>
      </div>
    </div>
  );
};
