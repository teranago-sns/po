import React, { useState, useEffect, useMemo } from 'react';
import { User, CalendarEvent, BoardTopic, Memo, WorkflowApplication, ChatRoom, OfficeMaster, DivisionMaster, PositionMaster, DailyReport, ApplicationType } from '../types';
import { AppTab } from './Sidebar';
import { getAvatarUrl, handleAvatarError } from '../utils/avatar';
import { API_BASE_URL } from '../config/api';
import { getLocalDateStr, formatTimeJST, getJstDateParts } from '../utils/dateUtils';
import { expandRecurringEvents } from '../utils/recurrenceUtils';
import {
  getReadEventIds,
  markEventAsRead as markEventAsReadUtil,
  getReadTopicIds,
  markTopicAsRead as markTopicAsReadUtil,
  getReadChatTimestamps,
  markChatRoomAsRead as markChatRoomAsReadUtil,
  getReadMemoIds,
  markMemoAsRead as markMemoAsReadUtil,
  markMemoAsUnread as markMemoAsUnreadUtil,
  getReadWorkflowIds,
  markWorkflowAsRead as markWorkflowAsReadUtil,
  getReadReportIds,
  markReportAsRead as markReportAsReadUtil,
  isEventUnread,
  isTopicUnread,
  isMemoUnhandled,
  isMemoUnread,
  isWorkflowPending,
  isChatUnread,
  isReportUnread,
  isUserReadStatusSynced,
  markProjectCardAsRead,
  ProjectMySummary,
  ProjectNotificationCard,
} from '../utils/notifications';
import { resolveApproverForStepDetails, resolveApproversForStep } from '../utils/workflowHelpers';
import { triggerOpenUserModal } from '../utils/userModal';
import { 
  User as UserIcon, 
  Calendar as CalendarIcon, 
  Monitor, 
  Phone, 
  FileText, 
  Check, 
  Clock, 
  ChevronRight, 
  AlertCircle, 
  Building2, 
  Briefcase, 
  MapPin, 
  Users, 
  ExternalLink, 
  X, 
  MessageSquare,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ArrowUpRight,
  Settings,
  Copy,
  RefreshCw,
  Edit2,
  Camera,
  Upload,
  Trash2,
  LogOut,
  Plus,
  Bell,
  BellRing,
  BellOff,
  Smartphone,
  Send,
  Loader2,
  Info,
  Wrench,
  AlertTriangle,
  GripVertical,
  Undo2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  SlidersHorizontal,
  Mail,
  CheckSquare,
  Sparkles,
  Square,
  ShieldCheck,
  Lock,
  ChevronDown,
  ChevronUp,
  Pin,
  Coins,
  Type,
  Palette,
  BarChart2,
  HelpCircle,
  FolderKanban,
  Circle,
  ClipboardList,
  LayoutGrid,
  FileCheck2,
  HardHat,
  Boxes,
} from 'lucide-react';
import {
  isOptionalMenuVisible,
  isMyPageSectionVisibleByMenu,
  getHiddenMyPageSectionIdsByMenu,
} from '../utils/menuVisibility';
import { TopicDetailModal } from './TopicDetailModal';
import { EventModal } from './EventModal';
import { GlobalEventDetailModal } from './GlobalEventDetailModal';
import { TopicCreateModal } from './TopicCreateModal';
import { ApplicationModal } from './ApplicationModal';
import { MyPageSectionCard } from './MyPageSectionCard';
import { MyPageDisplaySettingsModal, DEFAULT_SECTION_COUNTS, DEFAULT_ENV_SETTINGS } from './MyPageDisplaySettingsModal';
import {
  isTopicCurrentlyPinned,
  formatPinnedUntilBadge,
  getPollDeadlineMs,
  isUserTopicAuthor,
  canUserViewTopic,
  isTopicTargetedToUser,
  hasTopicTargetMembers,
  getTopicScopeBadgeLabel,
} from '../utils/boardHelpers';
import { ApprovalFlowRule, ItemMaster, ApplicationStatus, MyPageSectionCounts, MyPageEnvSettings } from '../types';
import { SchedulePoll } from '../types/schedulePoll';
import { RecurrenceActionScope } from './RecurrenceActionModal';

interface MyPageProps {
  user: User;
  events: CalendarEvent[];
  topics: BoardTopic[];
  memos: Memo[];
  applications: WorkflowApplication[];
  chatRooms?: ChatRoom[];
  reports?: DailyReport[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  positions?: PositionMaster[];
  allUsers?: User[];
  onChangeTab: (tab: AppTab) => void;
  onNavigateToContent?: (target: {
    tab: AppTab;
    topicId?: string;
    chatRoomId?: string;
    memoId?: string;
    applicationId?: string;
    eventId?: string;
    reportId?: string;
    projectId?: string;
    taskId?: string;
    projectView?: 'kanban' | 'list' | 'mytasks';
    openCreateMemo?: boolean;
  }) => void;
  onSelectTag?: (tag: string) => void;
  onUpdateUser?: (updatedUser: User) => void;
  onUpdateMemo?: (updatedMemos: Memo[]) => void;
  onUpdateTopic?: (updatedTopic: BoardTopic) => void;
  onUpdateApplication?: (updatedApp: WorkflowApplication) => void;
  onAddEvent?: (eventData: Omit<CalendarEvent, 'id'>) => Promise<void> | void;
  onUpdateEvent?: (event: CalendarEvent) => Promise<void> | void;
  onDeleteEvent?: (eventId: string, scope?: RecurrenceActionScope, instanceDate?: string) => Promise<void> | void;
  onAddTopic?: (topicData: Omit<BoardTopic, 'id' | 'createdAt' | 'views' | 'commentsCount'>) => Promise<void> | void;
  onAddApplication?: (application: Omit<WorkflowApplication, 'id' | 'createdAt' | 'status'> & { status?: ApplicationStatus }) => Promise<void> | void;
  approvalFlows?: ApprovalFlowRule[];
  itemMasters?: ItemMaster[];
  impersonatorAdmin?: User | null;
  onRevertToAdmin?: () => void;
  onLogout?: () => void;
  pendingSchedulePolls?: SchedulePoll[];
  schedulePolls?: SchedulePoll[];
  onOpenSchedulePollModal?: (pollId?: string) => void;
  projectSummary?: ProjectMySummary;
  isProjectSummaryLoading?: boolean;
  onUpdateProjectSummary?: React.Dispatch<React.SetStateAction<ProjectMySummary>>;
}

export function MyPage({
  user,
  events,
  topics,
  memos,
  applications,
  chatRooms = [],
  reports = [],
  offices = [],
  divisions = [],
  positions = [],
  allUsers = [],
  onChangeTab,
  onNavigateToContent,
  onUpdateUser,
  onUpdateMemo,
  onUpdateTopic,
  onUpdateApplication,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onAddTopic,
  onAddApplication,
  approvalFlows = [],
  itemMasters = [],
  impersonatorAdmin,
  onRevertToAdmin,
  onLogout,
  pendingSchedulePolls = [],
  schedulePolls = [],
  onOpenSchedulePollModal,
  projectSummary: externalProjectSummary,
  isProjectSummaryLoading: externalProjectSummaryLoading,
  onUpdateProjectSummary,
}: MyPageProps) {
  // ローカル既読状態管理（サーバー既読データ同期状態を含めて即時参照し1フレームのチラつきを防止）
  const [notificationSyncTick, setNotificationSyncTick] = useState(0);
  const isReadSynced = isUserReadStatusSynced(user?.id);
  const readEventIds = useMemo(() => getReadEventIds(user?.id), [user?.id, notificationSyncTick]);
  const readTopicIds = useMemo(() => getReadTopicIds(user?.id), [user?.id, notificationSyncTick]);
  const readChatTimestamps = useMemo(() => getReadChatTimestamps(user?.id), [user?.id, notificationSyncTick]);
  const readMemoIds = useMemo(() => getReadMemoIds(user?.id), [user?.id, notificationSyncTick]);
  const readReportIds = useMemo(() => getReadReportIds(user?.id), [user?.id, notificationSyncTick]);

  useEffect(() => {
    const handleSync = () => {
      setNotificationSyncTick((t) => t + 1);
    };
    window.addEventListener('notifications_updated', handleSync);
    return () => window.removeEventListener('notifications_updated', handleSync);
  }, [user?.id]);

  // モーダル管理
  const [selectedTopic, setSelectedTopic] = useState<BoardTopic | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [isCopyMode, setIsCopyMode] = useState<boolean>(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isCreateTopicModalOpen, setIsCreateTopicModalOpen] = useState(false);
  const [isCreateApplicationOpen, setIsCreateApplicationOpen] = useState(false);
  const [createAppInitialType, setCreateAppInitialType] = useState<ApplicationType>('purchase_order');

  // D&D並び替え状態管理
  const DEFAULT_SECTION_ORDER = ['events', 'topics', 'memos', 'projects', 'workflow', 'chats', 'reports'];
  const savedOrder = user?.preferences?.mypageSectionOrder;
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    if (Array.isArray(savedOrder) && savedOrder.length > 0) {
      const valid = savedOrder.filter(id => DEFAULT_SECTION_ORDER.includes(id));
      const missing = DEFAULT_SECTION_ORDER.filter(id => !valid.includes(id));
      return [...valid, ...missing];
    }
    return DEFAULT_SECTION_ORDER;
  });

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (Array.isArray(user?.preferences?.mypageSectionOrder) && user.preferences.mypageSectionOrder.length > 0) {
      const valid = user.preferences.mypageSectionOrder.filter(id => DEFAULT_SECTION_ORDER.includes(id));
      const missing = DEFAULT_SECTION_ORDER.filter(id => !valid.includes(id));
      setSectionOrder([...valid, ...missing]);
    }
  }, [user?.preferences?.mypageSectionOrder]);

  const handleSaveOrder = (newOrder: string[]) => {
    setSectionOrder(newOrder);
    if (onUpdateUser) {
      const updatedUser: User = {
        ...user,
        preferences: {
          ...(user.preferences || {}),
          mypageSectionOrder: newOrder,
        },
      };
      onUpdateUser(updatedUser);
    }
  };

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const step = direction === 'up' ? -1 : 1;
    let targetIndex = index + step;
    while (
      targetIndex >= 0 &&
      targetIndex < sectionOrder.length &&
      !isMyPageSectionVisibleByMenu(user, sectionOrder[targetIndex])
    ) {
      targetIndex += step;
    }
    if (targetIndex < 0 || targetIndex >= sectionOrder.length) return;
    const newOrder = [...sectionOrder];
    const [movedItem] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, movedItem);
    handleSaveOrder(newOrder);
  };

  const handleResetOrder = () => {
    handleSaveOrder(DEFAULT_SECTION_ORDER);
  };

  // 表示件数・環境設定状態管理
  const [isDisplaySettingsOpen, setIsDisplaySettingsOpen] = useState(false);
  const [targetSettingsSectionId, setTargetSettingsSectionId] = useState<string | null>(null);

  const initialCounts = useMemo<Required<MyPageSectionCounts>>(() => {
    const fromPrefs = user?.preferences?.mypageSectionCounts || user?.preferences?.mypageSettings?.displayCounts;
    let fromLocal: any = null;
    try {
      const saved = localStorage.getItem(`user_preferences_${user?.id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        fromLocal = parsed?.mypageSectionCounts || parsed?.mypageSettings?.displayCounts;
      }
    } catch (_) {}

    return {
      events: fromLocal?.events ?? fromPrefs?.events ?? DEFAULT_SECTION_COUNTS.events,
      topics: fromLocal?.topics ?? fromPrefs?.topics ?? DEFAULT_SECTION_COUNTS.topics,
      memos: fromLocal?.memos ?? fromPrefs?.memos ?? DEFAULT_SECTION_COUNTS.memos,
      projects: fromLocal?.projects ?? fromPrefs?.projects ?? DEFAULT_SECTION_COUNTS.projects,
      workflow: fromLocal?.workflow ?? fromPrefs?.workflow ?? DEFAULT_SECTION_COUNTS.workflow,
      chats: fromLocal?.chats ?? fromPrefs?.chats ?? DEFAULT_SECTION_COUNTS.chats,
      reports: fromLocal?.reports ?? fromPrefs?.reports ?? DEFAULT_SECTION_COUNTS.reports,
    };
  }, [user?.preferences?.mypageSectionCounts, user?.preferences?.mypageSettings, user?.id]);

  const [sectionCounts, setSectionCounts] = useState<Required<MyPageSectionCounts>>(initialCounts);

  const initialEnvSettings = useMemo<MyPageEnvSettings>(() => {
    const fromPrefs = user?.preferences?.mypageSettings;
    let fromLocal: any = null;
    try {
      const saved = localStorage.getItem(`user_preferences_${user?.id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        fromLocal = parsed?.mypageSettings;
      }
    } catch (_) {}

    return {
      ...DEFAULT_ENV_SETTINGS,
      ...(fromPrefs || {}),
      ...(fromLocal || {}),
      displayCounts: sectionCounts,
    };
  }, [user?.preferences?.mypageSettings, user?.id, sectionCounts]);

  const [envSettings, setEnvSettings] = useState<MyPageEnvSettings>(initialEnvSettings);

  useEffect(() => {
    setSectionCounts(initialCounts);
  }, [initialCounts]);

  useEffect(() => {
    setEnvSettings(initialEnvSettings);
  }, [initialEnvSettings]);

  const handleOpenDisplaySettings = (sectionId?: string) => {
    setTargetSettingsSectionId(sectionId || null);
    setIsDisplaySettingsOpen(true);
  };

  const handleSaveDisplaySettings = async (
    newCounts: Required<MyPageSectionCounts>,
    newEnvSettings: MyPageEnvSettings
  ) => {
    setSectionCounts(newCounts);
    setEnvSettings(newEnvSettings);

    const mergedPrefs = {
      ...(user?.preferences || {}),
      mypageSectionCounts: newCounts,
      mypageSettings: {
        ...(user?.preferences?.mypageSettings || {}),
        ...newEnvSettings,
        displayCounts: newCounts,
      },
    };

    // ローカルストレージにバックアップ
    try {
      localStorage.setItem(`user_preferences_${user.id}`, JSON.stringify(mergedPrefs));
    } catch (_) {}

    // 既存のエンドポイント PUT /api/users/:id/preferences へ即時保存
    try {
      await fetch(`${API_BASE_URL}/users/${user.id}/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mergedPrefs),
      });
    } catch (err) {
      console.warn('Failed to sync display settings to server:', err);
    }

    // Appコンポーネントのユーザー情報も更新
    if (onUpdateUser) {
      onUpdateUser({
        ...user,
        preferences: mergedPrefs,
      });
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    const newOrder = [...sectionOrder];
    const [draggedItem] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, draggedItem);
    setDraggedIndex(null);
    handleSaveOrder(newOrder);
  };

  // 既存タグの収集
  const existingTags = React.useMemo(() => {
    const tagsSet = new Set<string>();
    topics.forEach(t => {
      if (t.tags) {
        t.tags.forEach(tag => tagsSet.add(tag));
      }
    });
    return Array.from(tagsSet);
  }, [topics]);

  // イベント既読化
  const markEventAsRead = (eventId: string) => {
    markEventAsReadUtil(user.id, eventId);
  };

  // メモの対応ステータストグル
  const handleToggleMemoStatus = (memoId: string) => {
    if (onUpdateMemo) {
      const updated = memos.map((m) => {
        if (m.id === memoId) {
          const nowIso = new Date().toISOString();
          const statuses = m.recipientStatuses || [];
          const isRecipient = statuses.some((st) => String(st.userId) === String(user.id) || (st.userName && st.userName === user.name));

          if (!isRecipient) {
            // 宛先メンバーでない場合は配列を変更しない
            return m;
          }

          const myStatus = statuses.find((st) => String(st.userId) === String(user.id) || (st.userName && st.userName === user.name));
          const nextHandled = !myStatus?.isHandled;

          // キャッシュの同期
          if (nextHandled) {
            markMemoAsReadUtil(user.id, memoId);
          } else {
            markMemoAsUnreadUtil(user.id, memoId);
          }

          const nextRecipientStatuses = statuses.map((st) => {
            if (st.userId === user.id) {
              return {
                ...st,
                isViewed: true,
                viewedAt: st.viewedAt || nowIso,
                isHandled: nextHandled,
                handledAt: nextHandled ? nowIso : undefined,
                handledByUserId: nextHandled ? user.id : undefined,
                handledByUserName: nextHandled ? user.name : undefined,
                status: nextHandled ? ('handled' as const) : ('read' as const),
              };
            }
            return st;
          });

          // 全員が対応完了しているかチェック
          const allHandled = nextRecipientStatuses.length > 0 && nextRecipientStatuses.every((s) => s.isHandled);
          const nextOverallStatus = allHandled ? ('handled' as const) : ('read' as const);

          return {
            ...m,
            status: nextOverallStatus,
            recipientStatuses: nextRecipientStatuses,
          };
        }
        return m;
      });
      onUpdateMemo(updated);
    }
  };

  // 1. 直近スケジュール（自分が参加している本日以降1週間の予定）
  const todayStr = getLocalDateStr(new Date());
  const todayStart = new Date(todayStr + 'T00:00:00');
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setHours(23, 59, 59, 999);

  const expandedMyPageEvents = useMemo(() => {
    if (!events || !events.length) return [];
    return expandRecurringEvents(events, todayStart, weekEnd);
  }, [events, todayStart, weekEnd]);

  const myEvents = useMemo(() => {
    return expandedMyPageEvents
      .filter((e) => {
        const isAttendee = e.attendees ? e.attendees.some((a) => a?.id === user?.id || a?.name === user?.name) : false;
        if (!isAttendee) return false;

        const eventStart = new Date(e.start);
        const eventEnd = e.end ? new Date(e.end) : eventStart;

        return eventEnd >= todayStart && eventStart <= weekEnd;
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [expandedMyPageEvents, user?.id, user?.name, todayStart, weekEnd]);

  const unreadEvents = useMemo(() => {
    if (!isReadSynced) return [];
    return myEvents.filter((e) => isEventUnread(e, user, readEventIds));
  }, [myEvents, user, readEventIds, isReadSynced]);

  // 確定前（オープン）の日程調整一覧（主催または参加対象）
  const allActivePolls = useMemo(() => {
    const sourcePolls = (schedulePolls && schedulePolls.length > 0) ? schedulePolls : (pendingSchedulePolls || []);
    if (!user?.id || !sourcePolls.length) return [];

    return sourcePolls
      .filter((poll) => {
        if (poll.status !== 'open') return false;
        const myId = String(user.id);
        const isOrganizer = String(poll.organizerId) === myId;
        const isTarget = Array.isArray(poll.targetUserIds) && poll.targetUserIds.map(String).includes(myId);
        return isOrganizer || isTarget;
      })
      .sort((a, b) => {
        const myId = String(user.id);
        const aMyAnswered = (a.answeredUserIds || []).includes(myId);
        const bMyAnswered = (b.answeredUserIds || []).includes(myId);
        const aIsOrganizer = String(a.organizerId) === myId;
        const bIsOrganizer = String(b.organizerId) === myId;

        const aTargetCount = a.targetUserIds?.length || 0;
        const aAnsCount = a.answeredCount !== undefined ? a.answeredCount : (a.answeredUserIds || []).filter(uid => (a.targetUserIds || []).includes(uid)).length;
        const aAllDone = aTargetCount > 0 && aAnsCount >= aTargetCount;

        const bTargetCount = b.targetUserIds?.length || 0;
        const bAnsCount = b.answeredCount !== undefined ? b.answeredCount : (b.answeredUserIds || []).filter(uid => (b.targetUserIds || []).includes(uid)).length;
        const bAllDone = bTargetCount > 0 && bAnsCount >= bTargetCount;

        // 参加者で未回答のものを最優先
        if (!aIsOrganizer && !aMyAnswered && (bIsOrganizer || bMyAnswered)) return -1;
        if (!bIsOrganizer && !bMyAnswered && (aIsOrganizer || aMyAnswered)) return 1;

        // 主催者で全員回答完了（要確定）のものを次点
        if (aIsOrganizer && aAllDone && !(bIsOrganizer && bAllDone)) return -1;
        if (bIsOrganizer && bAllDone && !(aIsOrganizer && aAllDone)) return 1;

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [schedulePolls, pendingSchedulePolls, user?.id]);

  const actionablePollCount = useMemo(() => {
    return allActivePolls.filter((poll) => {
      const myId = String(user?.id);
      const isOrganizer = String(poll.organizerId) === myId;
      if (isOrganizer) {
        const targetCount = poll.targetUserIds?.length || 0;
        const ansCount = poll.answeredCount !== undefined ? poll.answeredCount : (poll.answeredUserIds || []).filter(uid => (poll.targetUserIds || []).includes(uid)).length;
        return targetCount > 0 && ansCount >= targetCount;
      } else {
        const hasMyAnswer = (poll.answeredUserIds || []).includes(myId);
        return !hasMyAnswer;
      }
    }).length;
  }, [allActivePolls, user?.id]);

  // 2. 対象の掲示板トピック（全社・自拠点・自部署・マイグループ/指定メンバー宛て、または自分が投稿）
  const myTopics = useMemo(() => {
    if (!topics || !topics.length) return [];
    return topics
      .filter((t) => {
        // 自分が投稿・作成したトピックは常にマイページに表示
        if (isUserTopicAuthor(t, user)) return true;

        // 限定公開 (isStrictScope) の閲覧権限チェック
        if (!canUserViewTopic(t, user, offices, divisions)) return false;

        // マイグループ・指定メンバー / 拠点・部署の対象判定
        return isTopicTargetedToUser(t, user, offices, divisions);
      })
      .sort((a, b) => {
        // 1. 有効なピン留め（期限内）があるものを最上位に表示
        const aPinned = isTopicCurrentlyPinned(a);
        const bPinned = isTopicCurrentlyPinned(b);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        // 2. 作成日時降順
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [topics, user, offices, divisions]);

  const unreadTopics = useMemo(() => {
    if (!isReadSynced) return [];
    return myTopics.filter((t) => isTopicUnread(t, user, readTopicIds));
  }, [myTopics, user, readTopicIds, isReadSynced]);

  // 未回答のアンケート付きトピック（期限内かつ自分が未回答）
  const unansweredPollTopics = useMemo(() => {
    return (myTopics || []).filter((t) => {
      if (!t.poll) return false;
      const deadlineMs = t.poll.deadline ? getPollDeadlineMs(t.poll.deadline) : NaN;
      if (!isNaN(deadlineMs) && Date.now() > deadlineMs) return false;
      const myVote = (t.poll.votes || []).find((v) => String(v.userId) === String(user?.id));
      return !myVote;
    });
  }, [myTopics, user?.id]);

  // 3. 自分宛ての伝言メモ (未対応を一番上に表示、同ステータス内は新しい順)
  const myMemos = useMemo(() => {
    return (memos || [])
      .filter((m) => {
        if (m.recipientStatuses && m.recipientStatuses.length > 0) {
          return m.recipientStatuses.some((st) => String(st.userId) === String(user?.id) || (st.userName && st.userName === user?.name));
        }
        if (m.toUsers && m.toUsers.length > 0) {
          return m.toUsers.some((u) => String(u?.id) === String(user?.id) || u?.name === user?.name);
        }
        if (m.toUser) {
          return String(m.toUser.id) === String(user?.id) || m.toUser.name === user?.name || (m.toUser.loginId && m.toUser.loginId === user?.loginId);
        }
        return true;
      })
      .sort((a, b) => {
        const aUnhandled = isMemoUnhandled(a, user) ? 1 : 0;
        const bUnhandled = isMemoUnhandled(b, user) ? 1 : 0;
        if (aUnhandled !== bUnhandled) {
          return bUnhandled - aUnhandled; // 未対応 (1) が一番上
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [memos, user]);

  const unhandledMemos = myMemos.filter((m) => isMemoUnhandled(m, user));
  const unreadMemos = useMemo(() => {
    if (!isReadSynced) return [];
    return myMemos.filter((m) => isMemoUnread(m, user, readMemoIds));
  }, [myMemos, user, readMemoIds, isReadSynced]);

  // 4. 自分に関係するワークフロー（自分が申請者、または承認者・承認履歴・ステップ対象者）
  // ※ 金銀日報はマイページ内ワークフローの表示対象外
  const myApplications = applications
    .filter(
      (a) =>
        a.type !== 'gold_silver_daily_report' &&
        (a.applicant?.id === user?.id ||
        a.applicant?.name === user?.name ||
        a.approver?.id === user?.id ||
        a.approver?.name === user?.name ||
        a.history?.some(h => h.approver?.id === user?.id || h.approver?.name === user?.name) ||
        (a.stepsConfig && a.stepsConfig.some(s =>
          s.specificUserId === user?.id ||
          s.manualApproverId === user?.id ||
          s.resolvedApproverId === user?.id ||
          (Array.isArray(s.orApproverUserIds) && s.orApproverUserIds.includes(user?.id))
        )) ||
        isWorkflowPending(a, user, allUsers, offices))
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const pendingApprovals = myApplications.filter((a) => isWorkflowPending(a, user, allUsers, offices));

  // 5. 参加しているチャットルーム
  const myChatRooms = (chatRooms || [])
    .filter((room) => room.participants?.some((p) => p?.id === user?.id || p?.name === user?.name))
    .sort((a, b) => {
      const aTime = a.messages && a.messages.length > 0 ? a.messages[a.messages.length - 1].createdAt || a.lastUpdated : a.lastUpdated;
      const bTime = b.messages && b.messages.length > 0 ? b.messages[b.messages.length - 1].createdAt || b.lastUpdated : b.lastUpdated;
      return new Date(bTime || 0).getTime() - new Date(aTime || 0).getTime();
    });

  const unreadChatRooms = useMemo(() => {
    if (!isReadSynced) return [];
    return myChatRooms.filter((room) => isChatUnread(room, user, readChatTimestamps));
  }, [myChatRooms, user, readChatTimestamps, isReadSynced]);

  // 6. 自分に関係する日報・週報（自分が作成者 または 上長）
  const myReports = useMemo(() => {
    return (reports || [])
      .filter((r) => {
        const authorId = r.author?.id || (r as any).authorId;
        const supervisorId = r.supervisorId || r.supervisor?.id || (r.author as any)?.supervisorId;
        const isMine = authorId === user?.id;
        const isSupervisor = supervisorId === user?.id;

        // 自分以外（部下等）の報告書で「下書き (draft)」のものは非開示
        if (!isMine && r.status === 'draft') {
          return false;
        }

        return isMine || isSupervisor;
      })
      .sort((a, b) => {
        const aTime = a.reviewedAt || a.submittedAt || a.createdAt || '';
        const bTime = b.reviewedAt || b.submittedAt || b.createdAt || '';
        return new Date(bTime || 0).getTime() - new Date(aTime || 0).getTime();
      });
  }, [reports, user?.id]);

  const unreadReports = useMemo(() => {
    if (!isReadSynced) return [];
    return myReports.filter((r) => isReportUnread(r, user, readReportIds));
  }, [myReports, user, readReportIds, isReadSynced]);

  // 7. プロジェクト・マイタスク サマリー（App.tsx からの共有データを優先利用し重複通信を排除）
  type MyProjectSummaryTask = ProjectNotificationCard;
  const hasExternalProjectSummary = externalProjectSummary !== undefined;
  const [localProjectSummary, setLocalProjectSummary] = useState<ProjectMySummary>({
    myPendingCount: 0,
    overdueCount: 0,
    dueSoonCount: 0,
    tasks: [],
  });
  const [localLoadingProjectSummary, setLocalLoadingProjectSummary] = useState(false);

  const myProjectSummary = hasExternalProjectSummary ? externalProjectSummary : localProjectSummary;
  const loadingProjectSummary = hasExternalProjectSummary
    ? Boolean(externalProjectSummaryLoading)
    : localLoadingProjectSummary;

  const isProjectsMenuVisible = isOptionalMenuVisible(user, 'projects');

  const fetchMyProjectSummaryFallback = React.useCallback(async () => {
    if (hasExternalProjectSummary || !user?.id || !isProjectsMenuVisible) {
      if (!isProjectsMenuVisible) {
        setLocalProjectSummary({ myPendingCount: 0, overdueCount: 0, dueSoonCount: 0, tasks: [] });
      }
      return;
    }
    setLocalLoadingProjectSummary(true);
    try {
      const params = new URLSearchParams({
        userId: String(user.id),
        userName: user.name || '',
        officeId: user.officeId || '',
        office: user.office || '',
        divisionId: user.divisionId || '',
        division: user.division || '',
        isAdmin: String(Boolean(user.isAdmin || user.role === 'admin')),
      });
      const res = await fetch(`${API_BASE_URL}/projects/my-summary?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setLocalProjectSummary({
        myPendingCount: Number(data.myPendingCount || 0),
        overdueCount: Number(data.overdueCount || 0),
        dueSoonCount: Number(data.dueSoonCount || 0),
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
      });
    } catch (err) {
      console.warn('[MyPage] Failed to fetch project summary:', err);
    } finally {
      setLocalLoadingProjectSummary(false);
    }
  }, [hasExternalProjectSummary, isProjectsMenuVisible, user?.id, user?.name, user?.officeId, user?.office, user?.divisionId, user?.division, user?.isAdmin, user?.role]);

  useEffect(() => {
    if (hasExternalProjectSummary || !isProjectsMenuVisible) return;
    fetchMyProjectSummaryFallback();
    const handleProjectsUpdated = () => {
      fetchMyProjectSummaryFallback();
    };
    window.addEventListener('projects_updated', handleProjectsUpdated);
    return () => window.removeEventListener('projects_updated', handleProjectsUpdated);
  }, [hasExternalProjectSummary, isProjectsMenuVisible, fetchMyProjectSummaryFallback]);

  const handleToggleProjectTaskComplete = async (task: MyProjectSummaryTask, e: React.MouseEvent) => {
    e.stopPropagation();
    const prevSnapshot = myProjectSummary;
    const isOverdue = Boolean(task.dueDate && task.dueDate < todayStr);
    const soonDate = new Date(todayStr + 'T00:00:00+09:00');
    soonDate.setDate(soonDate.getDate() + 3);
    const soonStr = getLocalDateStr(soonDate);
    const isDueSoon = Boolean(task.dueDate && task.dueDate >= todayStr && task.dueDate <= soonStr);

    const applyOptimistic = (prev: ProjectMySummary): ProjectMySummary => ({
      myPendingCount: Math.max(0, prev.myPendingCount - 1),
      overdueCount: isOverdue ? Math.max(0, prev.overdueCount - 1) : prev.overdueCount,
      dueSoonCount: isDueSoon ? Math.max(0, prev.dueSoonCount - 1) : prev.dueSoonCount,
      tasks: prev.tasks.filter(t => t.id !== task.id),
    });

    if (onUpdateProjectSummary) {
      onUpdateProjectSummary(applyOptimistic);
    } else {
      setLocalProjectSummary(applyOptimistic);
    }

    try {
      const res = await fetch(`${API_BASE_URL}/projects/cards/${encodeURIComponent(task.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isCompleted: true,
          completedBy: user.id,
          updatedBy: user.id,
          syncColumn: true,
        }),
      });
      if (!res.ok) throw new Error('完了更新失敗');
      if (user?.id) {
        markProjectCardAsRead(user.id, String(task.id));
      }
      window.dispatchEvent(new Event('projects_updated'));
    } catch {
      if (onUpdateProjectSummary) {
        onUpdateProjectSummary(prevSnapshot);
      } else {
        setLocalProjectSummary(prevSnapshot);
      }
    }
  };

  // ワークフロー承認・却下アクションハンドラー
  const handleWorkflowAction = (appId: string, status: 'approved' | 'rejected') => {
    if (onUpdateApplication) {
      const target = applications.find((a) => a.id === appId);
      if (target) {
        onUpdateApplication({ ...target, status });
      }
    }
  };

  const renderSectionCard = (sectionId: string, index: number) => {
    const isFullWidth = false;
    const isDragging = draggedIndex === index;

    switch (sectionId) {
      case 'events':
        return (
          <MyPageSectionCard
            key="events"
            id="events"
            title="スケジュール"
            icon={CalendarIcon}
            iconBgColor="bg-amber-500 hover:bg-amber-600"
            badgeCount={unreadEvents.length + actionablePollCount}
            badgeLabel={actionablePollCount > 0 ? (unreadEvents.length > 0 ? '未確認/要対応' : '要対応あり') : '未確認'}
            badgeBgColor="bg-rose-500"
            onNavigate={() => onChangeTab('calendar')}
            onOpenSettings={() => handleOpenDisplaySettings('events')}
            density={envSettings.density}
            actionButton={
              <button
                type="button"
                onClick={() => setIsEventModalOpen(true)}
                className="text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                予定追加
              </button>
            }
            isFullWidth={isFullWidth}
            isDragging={isDragging}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="space-y-3">
              {/* 確定前の日程調整一覧（設定がONの場合にスケジュール上部に表示） */}
              {allActivePolls.length > 0 && envSettings.showActivePolls !== false && (
                <div className="space-y-2.5 mb-3.5 pb-3.5 border-b border-amber-200">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                      進行中の日程調整（{allActivePolls.length}件）
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenSchedulePollModal && onOpenSchedulePollModal()}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                    >
                      一覧を開く →
                    </button>
                  </div>
                  {allActivePolls.map((poll) => {
                    const isOrganizer = String(poll.organizerId) === String(user.id);
                    const targetCount = poll.targetUserIds?.length || 0;
                    const answeredUserIds = poll.answeredUserIds || [];
                    const answeredCount = poll.answeredCount !== undefined
                      ? poll.answeredCount
                      : answeredUserIds.filter(uid => (poll.targetUserIds || []).includes(uid)).length;
                    const isAllDone = targetCount > 0 && answeredCount >= targetCount;
                    const hasMyAnswer = answeredUserIds.includes(String(user.id));
                    const percent = Math.min(100, Math.round((answeredCount / Math.max(1, targetCount)) * 100));

                    return (
                      <div
                        key={poll.id}
                        onClick={() => onOpenSchedulePollModal && onOpenSchedulePollModal(poll.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs group ${
                          isOrganizer && isAllDone
                            ? 'bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-500/10 border-emerald-300 hover:border-emerald-400'
                            : !isOrganizer && !hasMyAnswer
                            ? 'bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/10 border-amber-300 hover:border-amber-400'
                            : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {isOrganizer ? (
                              isAllDone ? (
                                <span className="px-2 py-0.5 bg-rose-600 text-white text-[9px] font-black rounded-full animate-pulse shadow-2xs">
                                  全員回答済・要確定
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[9px] font-bold rounded-full">
                                  主催・調整中
                                </span>
                              )
                            ) : !hasMyAnswer ? (
                              <span className="px-2 py-0.5 bg-rose-500 text-white text-[9px] font-black rounded-full animate-pulse shadow-2xs">
                                要回答
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-bold rounded-full">
                                回答済
                              </span>
                            )}
                            <span className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600">
                              {poll.title}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-1.5">
                            <span>主催: {poll.organizerName}</span>
                            <span>所要: {poll.durationMinutes}分</span>
                            {poll.deadlineAt && (
                              <span className="text-rose-600 font-semibold">
                                期限: {new Date(poll.deadlineAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })}
                              </span>
                            )}
                          </div>

                          {/* 何人中何人が回答済みか表示 ＆ プログレスバー */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-slate-700 flex items-center gap-1">
                                <Users className="w-3 h-3 text-slate-400" />
                                <span>回答状況:</span>
                                <span className={`font-bold ${isAllDone ? 'text-emerald-700' : 'text-slate-800'}`}>
                                  {answeredCount} / {targetCount}人 回答済み ({percent}%)
                                </span>
                              </span>
                              {isAllDone && (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                  回答完了
                                </span>
                              )}
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200">
                              <div
                                className={`h-1.5 rounded-full transition-all duration-300 ${
                                  isAllDone ? 'bg-emerald-500' : percent > 50 ? 'bg-amber-500' : 'bg-indigo-500'
                                }`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenSchedulePollModal) onOpenSchedulePollModal(poll.id);
                            }}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg shadow-xs flex items-center gap-1 transition-colors cursor-pointer ${
                              isOrganizer && isAllDone
                                ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                                : !isOrganizer && !hasMyAnswer
                                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                            }`}
                          >
                            <span>
                              {isOrganizer && isAllDone
                                ? '日程を確定する'
                                : !isOrganizer && !hasMyAnswer
                                ? '回答する'
                                : isOrganizer
                                ? '集計を確認'
                                : '回答を確認・変更'}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {(() => {
                const eventLimit = sectionCounts.events;
                const displayedEvents = eventLimit > 0 ? myEvents.slice(0, eventLimit) : myEvents;

                return displayedEvents.length > 0 ? (
                  <>
                    {displayedEvents.map((evt) => {
                      const isUnread = isReadSynced && isEventUnread(evt, user, readEventIds);
                      const eventDate = new Date(evt.start);

                      return (
                        <div
                          key={evt.id}
                          onClick={() => {
                            if (onNavigateToContent) {
                              onNavigateToContent({ tab: 'calendar', eventId: evt.id });
                            } else {
                              setSelectedEvent(evt);
                            }
                            markEventAsRead(evt.id);
                          }}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 relative ${
                            isUnread
                              ? 'bg-amber-50/40 border-amber-300 hover:border-amber-400 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'
                          }`}
                        >
                          {isUnread && (
                            <span className="absolute top-3 right-3 px-2 py-0.5 bg-rose-500 text-white text-[9px] font-black rounded-full shadow-2xs">
                              NEW 未確認
                            </span>
                          )}

                          {(() => {
                            const evtParts = getJstDateParts(evt.start);
                            return (
                              <div className="bg-slate-100 text-slate-800 p-2.5 rounded-xl text-center min-w-[56px] shrink-0 border border-slate-200">
                                <div className="text-[10px] font-extrabold text-indigo-600 uppercase">
                                  {evtParts.weekdayShort}
                                </div>
                                <div className="text-base font-black leading-tight">
                                  {evtParts.day}
                                </div>
                              </div>
                            );
                          })()}

                          <div className="flex-1 min-w-0 pr-12">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                                evt.type === 'personal' ? 'bg-emerald-100 text-emerald-700' :
                                evt.type === 'construction' ? 'bg-amber-100 text-amber-700' :
                                evt.type === 'inspection' ? 'bg-indigo-100 text-indigo-700' :
                                evt.type === 'replacement' ? 'bg-cyan-100 text-cyan-700' :
                                evt.type === 'repair' ? 'bg-rose-100 text-rose-700' :
                                evt.type === 'visitor' ? 'bg-orange-100 text-orange-700' :
                                evt.type === 'business_trip' ? 'bg-sky-100 text-sky-700' :
                                (evt.type === 'meeting' || (evt as any).source === 'schedule_poll' || (evt as any).pollId) ? 'bg-violet-100 text-violet-700' :
                                'bg-slate-100 text-slate-700'
                              }`}>
                                {
                                  evt.type === 'personal' ? '個人' :
                                  evt.type === 'construction' ? '工事' :
                                  evt.type === 'inspection' ? '点検' :
                                  evt.type === 'replacement' ? '取替' :
                                  evt.type === 'repair' ? '修理' :
                                  evt.type === 'visitor' ? '来客' :
                                  evt.type === 'business_trip' ? '出張' :
                                  (evt.type === 'meeting' || (evt as any).source === 'schedule_poll' || (evt as any).pollId) ? '会議' : '予定'
                                }
                              </span>
                              <span className="text-xs font-mono text-slate-500">
                                {formatTimeJST(evt.start)}
                              </span>
                            </div>

                            <h3 className="text-sm font-bold text-slate-900 truncate">{evt.title}</h3>

                            {evt.location && (
                              <p className="text-xs text-slate-500 flex items-center gap-1 mt-1 truncate">
                                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                {evt.location}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {myEvents.length > displayedEvents.length && (
                      <div className="text-center pt-2">
                        <button
                          type="button"
                          onClick={() => onChangeTab('calendar')}
                          className="text-xs text-amber-600 hover:text-amber-700 font-bold hover:underline cursor-pointer"
                        >
                          他 {myEvents.length - displayedEvents.length} 件の予定をカレンダーで確認 →
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    本日以降1週間の参加予定はありません
                  </div>
                );
              })()}
            </div>
          </MyPageSectionCard>
        );

      case 'topics':
        return (
          <MyPageSectionCard
            key="topics"
            id="topics"
            title="掲示板"
            icon={Monitor}
            iconBgColor="bg-indigo-600 hover:bg-indigo-700"
            badgeCount={unreadTopics.length}
            badgeLabel="未読"
            badgeBgColor="bg-indigo-600"
            onNavigate={() => onChangeTab('board')}
            onOpenSettings={() => handleOpenDisplaySettings('topics')}
            density={envSettings.density}
            actionButton={
              <button
                type="button"
                onClick={() => setIsCreateTopicModalOpen(true)}
                className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                新規投稿
              </button>
            }
            isFullWidth={isFullWidth}
            isDragging={isDragging}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="space-y-3">
              {/* 未回答のアンケート強調バナー */}
              {unansweredPollTopics.length > 0 && (
                <div className="p-3 bg-gradient-to-r from-sky-500/15 via-indigo-500/10 to-sky-500/10 border-2 border-sky-300 rounded-xl space-y-2 mb-2 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-bold text-sky-950">
                    <span className="flex items-center gap-1.5">
                      <BarChart2 className="w-4 h-4 text-sky-600 animate-pulse" />
                      【要回答】未回答のアンケートがあります（{unansweredPollTopics.length}件）
                    </span>
                    <span className="text-[10px] text-sky-700 font-semibold">タップして直接回答</span>
                  </div>
                  <div className="space-y-1.5">
                    {unansweredPollTopics.map(topic => (
                      <div
                        key={`unanswered-poll-${topic.id}`}
                        onClick={() => {
                          markTopicAsReadUtil(user?.id, topic.id);
                          if (onNavigateToContent) {
                            onNavigateToContent({ tab: 'board', topicId: topic.id });
                          } else {
                            setSelectedTopic(topic);
                          }
                        }}
                        className="p-2.5 bg-white hover:bg-sky-50/80 rounded-lg border border-sky-200 transition-all flex items-center justify-between gap-2 cursor-pointer shadow-2xs group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-800 truncate group-hover:text-sky-700">
                            {topic.title}
                          </div>
                          {topic.poll?.deadline && (
                            <div className="text-[10px] text-sky-700 flex items-center gap-1 mt-0.5 font-medium">
                              <Clock className="w-3 h-3 text-sky-600" />
                              回答期限: 〜{topic.poll.deadline}
                            </div>
                          )}
                        </div>
                        <span className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-bold rounded-md shrink-0 shadow-2xs">
                          回答する →
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(() => {
                const topicLimit = sectionCounts.topics;
                const displayedTopics = myTopics.slice(0, topicLimit);

                return displayedTopics.length > 0 ? (
                  <>
                    {displayedTopics.map((topic) => {
                      const unread = isReadSynced && isTopicUnread(topic, user, readTopicIds);
                      const isPinned = isTopicCurrentlyPinned(topic);

                      return (
                        <div
                          key={topic.id}
                          onClick={() => {
                            markTopicAsReadUtil(user?.id, topic.id);
                            if (onNavigateToContent) {
                              onNavigateToContent({ tab: 'board', topicId: topic.id });
                            } else {
                              setSelectedTopic(topic);
                            }
                            if (onUpdateTopic && unread) {
                              const newViewers = [...(topic.viewers || []), { user, viewedAt: new Date().toISOString() }];
                              onUpdateTopic({ ...topic, viewers: newViewers });
                            }
                          }}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 relative ${
                            isPinned
                              ? 'border-amber-300/90 bg-gradient-to-r from-amber-50/40 via-white to-white hover:border-amber-400 shadow-xs'
                              : unread
                              ? 'bg-indigo-50/40 border-indigo-300 hover:border-indigo-400 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              {isPinned && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-amber-500 text-white rounded-md shadow-2xs">
                                  <Pin className="w-2.5 h-2.5 fill-white" />
                                  <span>{formatPinnedUntilBadge(topic.pinnedUntil, topic.poll)}</span>
                                </span>
                              )}

                              {/* アンケートバッジ */}
                              {topic.poll && (
                                (() => {
                                  const myVote = (topic.poll.votes || []).find(v => String(v.userId) === String(user?.id));
                                  const deadlineMs = topic.poll.deadline ? new Date(topic.poll.deadline).getTime() : NaN;
                                  const isExpired = !isNaN(deadlineMs) && Date.now() > deadlineMs;
                                  return (
                                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                      myVote
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : isExpired
                                        ? 'bg-slate-200 text-slate-700'
                                        : 'bg-rose-500 text-white font-black animate-pulse shadow-2xs'
                                    }`}>
                                      <BarChart2 className="w-2.5 h-2.5" />
                                      <span>{myVote ? '回答済' : isExpired ? 'アンケート終了' : '要回答'}</span>
                                    </span>
                                  );
                                })()
                              )}

                              {unread ? (
                                <span className="px-2 py-0.5 bg-rose-500 text-white font-black text-[9px] rounded-full">
                                  未読
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[9px] rounded-full">
                                  既読
                                </span>
                              )}

                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${
                                hasTopicTargetMembers(topic)
                                  ? 'bg-violet-100 text-violet-800'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}>
                                {hasTopicTargetMembers(topic) && <Users className="w-2.5 h-2.5 shrink-0" />}
                                <span>{getTopicScopeBadgeLabel(topic, offices, divisions)}</span>
                              </span>
                              {topic.isStrictScope && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded">
                                  <Lock className="w-2.5 h-2.5 shrink-0" />
                                  <span>限定</span>
                                </span>
                              )}

                              <span className="text-[10px] text-slate-400">
                                {new Date(topic.createdAt).toLocaleDateString('ja-JP')}
                              </span>
                            </div>

                            <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{topic.title}</h3>
                            <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{topic.content}</p>
                          </div>

                          <div className="flex items-center gap-1 text-slate-400 text-xs shrink-0 pt-1">
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>{topic.commentsCount || 0}</span>
                          </div>
                        </div>
                      );
                    })}

                    {myTopics.length > displayedTopics.length && (
                      <div className="text-center pt-2">
                        <button
                          type="button"
                          onClick={() => onChangeTab('board')}
                          className="text-xs text-indigo-600 hover:text-indigo-700 font-bold hover:underline cursor-pointer"
                        >
                          他 {myTopics.length - displayedTopics.length} 件の掲示板をすべて表示 →
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    対象の掲示板はありません
                  </div>
                );
              })()}
            </div>
          </MyPageSectionCard>
        );

      case 'memos':
        return (
          <MyPageSectionCard
            key="memos"
            id="memos"
            title="伝言メモ"
            icon={Phone}
            iconBgColor="bg-rose-500 hover:bg-rose-600"
            badgeCount={unhandledMemos.length}
            badgeLabel="未対応"
            badgeBgColor="bg-rose-500"
            onNavigate={() => onChangeTab('memo')}
            onOpenSettings={() => handleOpenDisplaySettings('memos')}
            density={envSettings.density}
            actionButton={
              <button
                type="button"
                onClick={() => {
                  if (onNavigateToContent) {
                    onNavigateToContent({ tab: 'memo', openCreateMemo: true });
                  } else {
                    onChangeTab('memo');
                  }
                }}
                className="text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                新規登録
              </button>
            }
            isFullWidth={isFullWidth}
            isDragging={isDragging}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="space-y-3">
              {(() => {
                const memoLimit = sectionCounts.memos;
                const displayedMemos = myMemos.slice(0, memoLimit);

                return displayedMemos.length > 0 ? (
                  <>
                    {displayedMemos.map((memo) => {
                      const isUnhandled = isMemoUnhandled(memo, user);
                      const isUnread = isReadSynced && isMemoUnread(memo, user, readMemoIds);
                      const rawContent = (memo.content || '').replace(/[\r\n\t]+/g, ' ').trim();
                      const memoSnippet = rawContent.length > 45 ? `${rawContent.slice(0, 45)}…` : rawContent;

                      return (
                        <div
                          key={memo.id}
                          onClick={() => {
                            markMemoAsReadUtil(user?.id, memo.id);
                            if (onNavigateToContent) {
                              onNavigateToContent({ tab: 'memo', memoId: memo.id });
                            }
                          }}
                          className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2 cursor-pointer hover:border-rose-400 ${
                            isUnhandled
                              ? 'bg-rose-50/40 border-rose-300 shadow-xs'
                              : 'bg-white border-slate-200 opacity-80'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              {isUnhandled ? (
                                <span className="px-2 py-0.5 bg-rose-500 text-white font-black text-[10px] rounded-full flex items-center gap-1 shrink-0">
                                  <Clock className="w-3 h-3" /> 未対応
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold text-[10px] rounded-full flex items-center gap-1 shrink-0">
                                  <Check className="w-3 h-3 text-emerald-600" /> 対応完了
                                </span>
                              )}
                              {isUnread && (
                                <span className="px-1.5 py-0.5 bg-amber-500 text-white font-black text-[9px] rounded-full shrink-0">
                                  未読
                                </span>
                              )}
                              {memo.requirementText && (
                                <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[9px] rounded shrink-0">
                                  {memo.requirementText}
                                </span>
                              )}
                              <span className="text-xs font-bold text-slate-900 truncate">
                                {memo.fromName} 様 {memo.fromCompany && <span className="text-slate-500 font-normal">({memo.fromCompany})</span>}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleMemoStatus(memo.id);
                              }}
                              className={`relative z-10 cursor-pointer px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all border shrink-0 ${
                                isUnhandled
                                  ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 hover:shadow-xs'
                                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                              }`}
                            >
                              {isUnhandled ? '対応完了にする' : '未対応に戻す'}
                            </button>
                          </div>

                          <div className="min-w-0">
                            <p className="text-xs text-slate-500 line-clamp-1 truncate" title={memo.content}>
                              {memoSnippet || '（用件・本文なし）'}
                            </p>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                            <span
                              onClick={(e) => {
                                if (memo.createdByUser) {
                                  e.stopPropagation();
                                  triggerOpenUserModal(memo.createdByUser);
                                }
                              }}
                              className={memo.createdByUser ? 'hover:text-rose-600 hover:underline cursor-pointer transition-colors' : ''}
                              title={memo.createdByUser ? '受付担当者の社員詳細を表示' : undefined}
                            >
                              受付: {memo.createdByUser?.name || '社内'}
                            </span>
                            <span>{new Date(memo.createdAt).toLocaleDateString('ja-JP')}</span>
                          </div>
                        </div>
                      );
                    })}
                    {myMemos.length > displayedMemos.length && (
                      <div className="text-center pt-1">
                        <button
                          type="button"
                          onClick={() => onChangeTab('memo')}
                          className="text-xs text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer"
                        >
                          他 {myMemos.length - displayedMemos.length} 件の伝言メモをすべて表示
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    自分宛ての伝言メモはありません
                  </div>
                );
              })()}
            </div>
          </MyPageSectionCard>
        );

      case 'projects':
        return (
          <MyPageSectionCard
            key="projects"
            id="projects"
            title="マイタスク・プロジェクト"
            icon={FolderKanban}
            iconBgColor="bg-emerald-600 hover:bg-emerald-700"
            badgeCount={myProjectSummary.myPendingCount}
            badgeLabel={
              myProjectSummary.overdueCount > 0
                ? `期限超過 ${myProjectSummary.overdueCount}`
                : '未完了'
            }
            badgeBgColor={myProjectSummary.overdueCount > 0 ? 'bg-rose-500' : 'bg-emerald-600'}
            onNavigate={() => {
              if (onNavigateToContent) {
                onNavigateToContent({ tab: 'projects', projectView: 'mytasks' });
              } else {
                onChangeTab('projects');
              }
            }}
            onOpenSettings={() => handleOpenDisplaySettings('projects')}
            density={envSettings.density}
            actionButton={
              <button
                type="button"
                onClick={() => {
                  if (onNavigateToContent) {
                    onNavigateToContent({ tab: 'projects', projectView: 'mytasks' });
                  } else {
                    onChangeTab('projects');
                  }
                }}
                className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                マイタスク
              </button>
            }
            isFullWidth={isFullWidth}
            isDragging={isDragging}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="space-y-2.5">
              {(myProjectSummary.overdueCount > 0 || myProjectSummary.dueSoonCount > 0) && (
                <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-slate-100 text-[11px]">
                  {myProjectSummary.overdueCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                      <AlertCircle className="w-3 h-3" />
                      期限超過 {myProjectSummary.overdueCount}件
                    </span>
                  )}
                  {myProjectSummary.dueSoonCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                      <Clock className="w-3 h-3" />
                      3日以内の期限 {myProjectSummary.dueSoonCount}件
                    </span>
                  )}
                </div>
              )}

              {loadingProjectSummary && myProjectSummary.tasks.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>読み込み中...</span>
                </div>
              ) : (() => {
                const projLimit = sectionCounts.projects || 5;
                const displayedTasks = myProjectSummary.tasks.slice(0, projLimit);

                return displayedTasks.length > 0 ? (
                  <>
                    {displayedTasks.map((task) => {
                      const isOverdue = Boolean(task.dueDate && task.dueDate < todayStr);
                      const isTodayDue = Boolean(task.dueDate && task.dueDate === todayStr);
                      const checkTotal =
                        typeof task.checklistTotal === 'number'
                          ? task.checklistTotal
                          : (task.checklist || []).length;
                      const checkDone =
                        typeof task.checklistDone === 'number'
                          ? task.checklistDone
                          : (task.checklist || []).filter(c => c.done).length;
                      const commentCount =
                        typeof task.commentCount === 'number'
                          ? task.commentCount
                          : (task.comments || []).length;

                      return (
                        <div
                          key={task.id}
                          onClick={() => {
                            if (onNavigateToContent) {
                              onNavigateToContent({
                                tab: 'projects',
                                projectId: task.projectId,
                                taskId: task.id,
                              });
                            } else {
                              onChangeTab('projects');
                            }
                          }}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 group ${
                            isOverdue
                              ? 'bg-rose-50/45 border-rose-200 hover:border-rose-300 shadow-2xs'
                              : isTodayDue
                              ? 'bg-amber-50/40 border-amber-200 hover:border-amber-300 shadow-2xs'
                              : 'bg-white border-slate-200 hover:border-emerald-300 hover:bg-slate-50/50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={(e) => handleToggleProjectTaskComplete(task, e)}
                            title="完了にする"
                            className="mt-0.5 text-slate-300 hover:text-emerald-600 transition-colors shrink-0 cursor-pointer"
                          >
                            <Circle className="w-4 h-4" />
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                              {task.projectTitle && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold truncate max-w-[140px]">
                                  {task.projectTitle}
                                </span>
                              )}
                              {task.priority === 'high' && (
                                <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">
                                  優先: 高
                                </span>
                              )}
                              {task.priority === 'medium' && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                  優先: 中
                                </span>
                              )}
                              {task.dueDate && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    isOverdue
                                      ? 'bg-rose-600 text-white'
                                      : isTodayDue
                                      ? 'bg-amber-500 text-white'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {isOverdue ? `期限切れ (${task.dueDate})` : isTodayDue ? '本日期限' : `期限 ${task.dueDate}`}
                                </span>
                              )}
                            </div>

                            <h3 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-emerald-700 truncate">
                              {task.title}
                            </h3>

                            {(checkTotal > 0 || commentCount > 0) && (
                              <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                                {checkTotal > 0 && (
                                  <span className="flex items-center gap-1">
                                    <CheckSquare className="w-3 h-3" />
                                    {checkDone}/{checkTotal}
                                  </span>
                                )}
                                {commentCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    <MessageSquare className="w-3 h-3" />
                                    {commentCount}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {myProjectSummary.myPendingCount > displayedTasks.length && (
                      <div className="text-center pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToContent) {
                              onNavigateToContent({ tab: 'projects', projectView: 'mytasks' });
                            } else {
                              onChangeTab('projects');
                            }
                          }}
                          className="text-xs text-emerald-600 hover:text-emerald-700 font-bold hover:underline cursor-pointer"
                        >
                          他 {myProjectSummary.myPendingCount - displayedTasks.length} 件のマイタスクをすべて表示 →
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    未完了のマイタスクはありません
                  </div>
                );
              })()}
            </div>
          </MyPageSectionCard>
        );

      case 'workflow':
        return (
          <MyPageSectionCard
            key="workflow"
            id="workflow"
            title="ワークフロー"
            icon={FileText}
            iconBgColor="bg-purple-600 hover:bg-purple-700"
            badgeCount={pendingApprovals.length}
            badgeLabel="要承認"
            badgeBgColor="bg-purple-600"
            onNavigate={() => onChangeTab('workflow')}
            onOpenSettings={() => handleOpenDisplaySettings('workflow')}
            density={envSettings.density}
            actionButton={
              <button
                type="button"
                onClick={() => {
                  setCreateAppInitialType('purchase_order');
                  setIsCreateApplicationOpen(true);
                }}
                className="text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                新規申請
              </button>
            }
            isFullWidth={isFullWidth}
            isDragging={isDragging}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="space-y-3">
              {(() => {
                const workflowLimit = sectionCounts.workflow;
                const displayedWorkflow = myApplications.slice(0, workflowLimit);

                return displayedWorkflow.length > 0 ? (
                  <>
                    {displayedWorkflow.map((app) => {
                      const isMyApproval = isWorkflowPending(app, user, allUsers, offices);

                      // 現在の担当承認者名（多段階・OR承認ステップに対応）
                      let currentApproverName = app.approver?.name || '未指定';
                      if (app.stepsConfig && app.stepsConfig.length > 0) {
                        const curIdx = (app.currentStepIndex || 1) - 1;
                        const curStep = app.stepsConfig[curIdx];
                        if (curStep) {
                          const stepCtx = {
                            offices,
                            applicationOfficeId: app.officeId,
                            applicationLocation: app.location,
                          };
                          const isOrConfigured =
                            curStep.approvalMode === 'or' ||
                            (Array.isArray(curStep.orApprovers) && curStep.orApprovers.length > 0) ||
                            (Array.isArray(curStep.orApproverUserIds) && curStep.orApproverUserIds.length > 1);
                          if (isOrConfigured && !curStep.manualApproverId) {
                            const orApprovers = resolveApproversForStep(app.applicant, curStep, allUsers || [], stepCtx);
                            const applicantId = app.applicant?.id ? String(app.applicant.id) : '';
                            const eligible =
                              applicantId && orApprovers.some(u => String(u.id) !== applicantId)
                                ? orApprovers.filter(u => String(u.id) !== applicantId)
                                : orApprovers;
                            if (eligible.length > 1) {
                              currentApproverName = `${eligible.map(u => u.name).join(' / ')}（OR）`;
                            } else if (eligible[0]?.name) {
                              currentApproverName = eligible[0].name;
                            }
                          } else {
                            const res = resolveApproverForStepDetails(app.applicant, curStep, curIdx, allUsers || [], stepCtx);
                            if (res?.user?.name) {
                              currentApproverName = res.user.name;
                            }
                          }
                        }
                      }

                      return (
                        <div
                          key={app.id}
                          onClick={() => {
                            markWorkflowAsReadUtil(user?.id, app.id);
                            if (onNavigateToContent) {
                              onNavigateToContent({ tab: 'workflow', applicationId: app.id });
                            } else {
                              onChangeTab('workflow');
                            }
                          }}
                          className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2 cursor-pointer hover:border-purple-400 ${
                            isMyApproval
                              ? 'bg-purple-50/50 border-purple-300 shadow-xs'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {app.status === 'approved' && (
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded">
                                  承認済
                                </span>
                              )}
                              {app.status === 'rejected' && (
                                <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-extrabold rounded">
                                  却下
                                </span>
                              )}
                              {app.status === 'pending' && (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-extrabold rounded">
                                  申請中
                                </span>
                              )}

                              <span className="text-xs font-extrabold text-slate-900">{app.title}</span>
                            </div>

                            {isMyApproval && (
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => handleWorkflowAction(app.id, 'approved')}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded shadow-2xs flex items-center gap-0.5 cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3 h-3" /> 承認
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleWorkflowAction(app.id, 'rejected')}
                                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded shadow-2xs flex items-center gap-0.5 cursor-pointer"
                                >
                                  <XCircle className="w-3 h-3" /> 却下
                                </button>
                              </div>
                            )}
                          </div>

                          <p className="text-xs text-slate-500 line-clamp-1">{app.description}</p>

                          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                            <span
                              onClick={(e) => {
                                if (app.applicant) {
                                  e.stopPropagation();
                                  triggerOpenUserModal(app.applicant);
                                }
                              }}
                              className={app.applicant ? 'hover:text-purple-600 hover:underline cursor-pointer transition-colors' : ''}
                              title="申請者の社員詳細を表示"
                            >
                              申請者: {app.applicant?.name || '不明'}
                            </span>
                            <span
                              onClick={(e) => {
                                if (currentApproverName && currentApproverName !== '未指定') {
                                  e.stopPropagation();
                                  triggerOpenUserModal(currentApproverName);
                                }
                              }}
                              className={currentApproverName && currentApproverName !== '未指定' ? 'hover:text-purple-600 hover:underline cursor-pointer transition-colors' : ''}
                              title="承認者の社員詳細を表示"
                            >
                              承認者: {currentApproverName}
                            </span>
                            <span>{new Date(app.createdAt).toLocaleDateString('ja-JP')}</span>
                          </div>
                        </div>
                      );
                    })}

                    {myApplications.length > displayedWorkflow.length && (
                      <div className="text-center pt-2">
                        <button
                          type="button"
                          onClick={() => onChangeTab('workflow')}
                          className="text-xs text-purple-600 hover:text-purple-700 font-bold hover:underline cursor-pointer"
                        >
                          他 {myApplications.length - displayedWorkflow.length} 件のワークフローをすべて表示 →
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    関係するワークフローはありません
                  </div>
                );
              })()}
            </div>
          </MyPageSectionCard>
        );

      case 'chats':
      default:
        return (
          <MyPageSectionCard
            key="chats"
            id="chats"
            title="チャットルーム"
            icon={MessageSquare}
            iconBgColor="bg-blue-600 hover:bg-blue-700"
            badgeCount={unreadChatRooms.length}
            badgeLabel="未読"
            badgeBgColor="bg-blue-600"
            onNavigate={() => onChangeTab('chat')}
            onOpenSettings={() => handleOpenDisplaySettings('chats')}
            density={envSettings.density}
            isFullWidth={isFullWidth}
            isDragging={isDragging}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
              {(() => {
                const chatLimit = sectionCounts.chats;
                const displayedChats = myChatRooms.slice(0, chatLimit);

                // JST対応のコンパクトな日付フォーマッター
                const formatChatShortDate = (dateInput?: string | null): string => {
                  if (!dateInput) return '';
                  const d = new Date(dateInput);
                  if (isNaN(d.getTime())) return '';
                  const todayStr = getLocalDateStr(new Date());
                  const targetDateStr = getLocalDateStr(d);
                  const timeStr = formatTimeJST(d);
                  if (todayStr === targetDateStr) {
                    return timeStr;
                  }
                  const todayParts = todayStr.split('-').map(Number);
                  const targetParts = targetDateStr.split('-').map(Number);
                  const todayUtc = Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]);
                  const targetUtc = Date.UTC(targetParts[0], targetParts[1] - 1, targetParts[2]);
                  const diffDays = Math.round((todayUtc - targetUtc) / (1000 * 60 * 60 * 24));
                  if (diffDays === 1) {
                    return `昨日 ${timeStr}`;
                  }
                  if (todayParts[0] === targetParts[0]) {
                    return `${targetParts[1]}/${targetParts[2]} ${timeStr}`;
                  }
                  return `${targetParts[0]}/${targetParts[1]}/${targetParts[2]}`;
                };

                // 最新メッセージのスニペット生成
                const getMessageSnippet = (msg: any) => {
                  if (!msg) return { prefix: '', text: 'メッセージはありません', type: 'empty' };
                  const isMyMsg = String(msg.sender?.id || '') === String(user?.id || '');
                  const senderName = isMyMsg ? 'あなた' : (msg.sender?.name || 'メンバー');

                  if (msg.type === 'quiz' || msg.quizId) {
                    return {
                      prefix: `${senderName}:`,
                      text: msg.quiz?.question || msg.content || 'クイズが送信されました',
                      type: 'quiz',
                    };
                  }
                  if (msg.type === 'image' || msg.imageUrl || (msg.images && msg.images.length > 0)) {
                    return {
                      prefix: `${senderName}:`,
                      text: '画像を送信しました',
                      type: 'image',
                    };
                  }
                  if (msg.type === 'stamp' || msg.stampId) {
                    return {
                      prefix: `${senderName}:`,
                      text: msg.stampText || 'スタンプを送信しました',
                      type: 'stamp',
                    };
                  }
                  if (msg.attachments && msg.attachments.length > 0) {
                    return {
                      prefix: `${senderName}:`,
                      text: msg.attachments[0].name || 'ファイルを送信しました',
                      type: 'file',
                    };
                  }

                  let text = msg.content || '';
                  text = text.replace(/\[quote[^\]]*\][\s\S]*?\[\/quote\]/g, '').trim();
                  return {
                    prefix: `${senderName}:`,
                    text: text || 'メッセージを送信しました',
                    type: 'text',
                  };
                };

                return displayedChats.length > 0 ? (
                  <>
                    {displayedChats.map((room) => {
                      const isUnread = isReadSynced && isChatUnread(room, user, readChatTimestamps);
                      const lastMsg = room.messages && room.messages.length > 0 ? room.messages[room.messages.length - 1] : null;
                      const isGroup = room.type === 'group' || (room.participants && room.participants.length > 2);
                      const participants = room.participants || [];

                      // DM相手の特定とallUsersマスター照合
                      const otherParticipant = !isGroup
                        ? participants.find((p) => p && String(p.id) !== String(user?.id)) || participants[0]
                        : null;
                      const resolvedPartner = otherParticipant
                        ? allUsers.find((u) => String(u.id) === String(otherParticipant.id)) || otherParticipant
                        : null;

                      const partnerName = resolvedPartner?.name || otherParticipant?.name || 'メンバー';
                      const partnerAvatar = resolvedPartner?.avatarUrl || otherParticipant?.avatarUrl;
                      const partnerAffiliation = resolvedPartner
                        ? [resolvedPartner.office, resolvedPartner.division || resolvedPartner.department, resolvedPartner.position].filter(Boolean).join(' ')
                        : '';

                      const groupName = room.name || 'グループトーク';
                      const memberCount = participants.length;
                      const groupMembersPreview = participants.map((p) => p.name || 'メンバー').join(', ');

                      const snippet = getMessageSnippet(lastMsg);
                      const timestampStr = formatChatShortDate(lastMsg?.createdAt || room.lastUpdated);

                      return (
                        <div
                          key={room.id}
                          onClick={() => {
                            markChatRoomAsReadUtil(user?.id, room.id);
                            if (onNavigateToContent) {
                              onNavigateToContent({ tab: 'chat', chatRoomId: room.id });
                            } else {
                              onChangeTab('chat');
                            }
                          }}
                          className={`group relative p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                            isUnread
                              ? 'bg-blue-50/70 border-blue-300 shadow-2xs hover:border-blue-400 hover:bg-blue-50/90'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 hover:shadow-2xs'
                          }`}
                        >
                          {/* ルームアイコン / 相手アバター */}
                          <div className="relative shrink-0">
                            {isGroup ? (
                              room.avatarUrl ? (
                                <img
                                  src={getAvatarUrl(room.avatarUrl)}
                                  alt={groupName}
                                  onError={handleAvatarError}
                                  className="w-11 h-11 rounded-full object-cover border border-indigo-200/90 shadow-2xs"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200/90 flex items-center justify-center text-indigo-600 shadow-2xs">
                                  <Users className="w-5 h-5" />
                                </div>
                              )
                            ) : (
                              <img
                                src={getAvatarUrl(partnerAvatar)}
                                alt={partnerName}
                                onError={handleAvatarError}
                                className="w-11 h-11 rounded-full object-cover border border-slate-200/90 shadow-2xs group-hover:scale-102 transition-transform"
                              />
                            )}

                            {/* アイコン種別バッジ（右下に小さく表示） */}
                            <div
                              className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-white ring-2 ring-white shadow-2xs ${
                                isGroup ? 'bg-indigo-600' : 'bg-emerald-500'
                              }`}
                              title={isGroup ? 'グループトーク' : 'ダイレクトトーク'}
                            >
                              {isGroup ? <Users className="w-2.5 h-2.5" /> : <UserIcon className="w-2.5 h-2.5" />}
                            </div>
                          </div>

                          {/* ルーム情報 & メッセージスニペット */}
                          <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
                            {/* 1行目: ルーム名/相手名 + 種別バッジ + 日時 + 未読バッジ */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-bold text-slate-900 truncate">
                                  {isGroup ? groupName : `${partnerName} さん`}
                                </span>
                                {isGroup ? (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200/70 shrink-0">
                                    グループ
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/70 shrink-0">
                                    ダイレクト
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {timestampStr && (
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    {timestampStr}
                                  </span>
                                )}
                                {isUnread && (
                                  <span className="px-1.5 py-0.2 bg-blue-600 text-white text-[9px] font-black rounded-full shrink-0 shadow-2xs">
                                    NEW
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 2行目: 相手情報（ダイレクト時: 相手の氏名・所属） / グループ情報（参加メンバー一覧） */}
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
                              {isGroup ? (
                                <>
                                  <span className="text-slate-400 text-[10px] shrink-0">メンバー:</span>
                                  <span className="truncate text-slate-600 text-[11px]" title={groupMembersPreview}>
                                    {groupMembersPreview || `${memberCount}名`}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="text-slate-400 text-[10px] shrink-0">相手:</span>
                                  <span
                                    onClick={(e) => {
                                      if (resolvedPartner) {
                                        e.stopPropagation();
                                        triggerOpenUserModal(resolvedPartner);
                                      }
                                    }}
                                    className="font-semibold text-slate-700 hover:text-blue-600 hover:underline cursor-pointer transition-colors truncate"
                                    title="社員プロフィールを表示"
                                  >
                                    {partnerName} さん
                                  </span>
                                  {partnerAffiliation && (
                                    <span className="text-slate-400 text-[10px] truncate">
                                      ({partnerAffiliation})
                                    </span>
                                  )}
                                </>
                              )}
                            </div>

                            {/* 3行目: 最新メッセージ（間延びしない1行スッキリ表示） */}
                            <div className="text-xs text-slate-600 flex items-center gap-1.5 truncate bg-slate-50/80 px-2 py-0.5 rounded-md border border-slate-100 group-hover:bg-slate-100/70 transition-colors mt-0.5">
                              {snippet.type === 'quiz' && (
                                <HelpCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              )}
                              {snippet.type === 'image' && (
                                <Camera className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              )}
                              {snippet.type === 'stamp' && (
                                <Sparkles className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                              )}
                              {snippet.type === 'file' && (
                                <FileText className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              )}

                              {snippet.prefix && (
                                <span className="font-semibold text-slate-700 shrink-0 text-[11px]">
                                  {snippet.prefix}
                                </span>
                              )}
                              <span className="truncate text-[11px] text-slate-600">
                                {snippet.text}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {myChatRooms.length > displayedChats.length && (
                      <div className="text-center pt-2 col-span-full">
                        <button
                          type="button"
                          onClick={() => onChangeTab('chat')}
                          className="text-xs text-blue-600 hover:text-blue-700 font-bold hover:underline cursor-pointer"
                        >
                          他 {myChatRooms.length - displayedChats.length} 件のチャットルームをすべて表示 →
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs col-span-full">
                    参加しているチャットルームはありません
                  </div>
                );
              })()}
            </div>
          </MyPageSectionCard>
        );

      case 'reports':
        return (
          <MyPageSectionCard
            key="reports"
            id="reports"
            title="日報・週報"
            icon={FileText}
            iconBgColor="bg-teal-600 hover:bg-teal-700"
            badgeCount={unreadReports.length}
            badgeLabel="未確認"
            badgeBgColor="bg-teal-600"
            onNavigate={() => onChangeTab('daily_report')}
            onOpenSettings={() => handleOpenDisplaySettings('reports')}
            density={envSettings.density}
            actionButton={
              <button
                type="button"
                onClick={() => onChangeTab('daily_report')}
                className="text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                作成・確認
              </button>
            }
            isFullWidth={isFullWidth}
            isDragging={isDragging}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
              {(() => {
                const reportLimit = sectionCounts.reports;
                const displayedReports = myReports.slice(0, reportLimit);

                return displayedReports.length > 0 ? (
                  <>
                    {displayedReports.map((report) => {
                      const isUnread = isReadSynced && isReportUnread(report, user, readReportIds);
                      const isAuthor = (report.author?.id || (report as any).authorId) === user?.id;
                      const isWeekly = report.reportType === 'weekly';
                      const isMaintenance = report.reportType === 'maintenance_daily';
                      const isSales = report.reportType === 'sales_daily';
                      const isConstruction = report.reportType === 'construction_daily';
                      const typeLabel = isMaintenance 
                        ? '保守日報' 
                        : (isSales 
                          ? '営業日報' 
                          : (isConstruction 
                            ? '工務日報' 
                            : (isWeekly ? '週報' : '日報')));
                      const title = report.weekLabel || (isWeekly ? `週報 (${report.weekStartDate || ''}~)` : `${typeLabel} (${report.date || ''})`);
                      const dateStr = report.date || report.weekStartDate || (report.createdAt ? new Date(report.createdAt).toLocaleDateString('ja-JP') : '');

                      return (
                        <div
                          key={report.id}
                          onClick={() => {
                            markReportAsReadUtil(user?.id, report.id);
                            if (onNavigateToContent) {
                              onNavigateToContent({ tab: 'daily_report', reportId: report.id });
                            } else {
                              onChangeTab('daily_report');
                            }
                          }}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                            isUnread
                              ? 'bg-teal-50/50 border-teal-300 shadow-xs hover:border-teal-400'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold shrink-0 ${
                                isMaintenance ? 'bg-amber-100 text-amber-800' : (isWeekly ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800')
                              }`}>
                                {typeLabel}
                              </span>
                              <span className="text-xs font-extrabold text-slate-900 line-clamp-1">
                                {title}
                              </span>
                            </div>
                            {isUnread && (
                              <span className="px-2 py-0.5 bg-teal-600 text-white text-[9px] font-black rounded-full shrink-0 animate-pulse">
                                NEW {isAuthor ? '要確認' : '未確認'}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-xs text-slate-600">
                            <span
                              onClick={(e) => {
                                if (report.author) {
                                  e.stopPropagation();
                                  triggerOpenUserModal(report.author);
                                }
                              }}
                              className="font-medium hover:text-teal-600 hover:underline cursor-pointer transition-colors"
                              title="作成者の社員詳細を表示"
                            >
                              {report.author?.name || '作成者未設定'}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              report.status === 'reviewed' 
                                ? 'bg-emerald-100 text-emerald-700' 
                                : report.status === 'draft'
                                ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {report.status === 'reviewed' ? '確認済' : report.status === 'draft' ? '下書き' : '確認待ち'}
                            </span>
                          </div>

                          {report.feedbackComment && (
                            <p className="text-xs text-slate-600 line-clamp-1 bg-slate-50 p-1.5 rounded border border-slate-100">
                              <span className="font-bold text-slate-700">上長コメント: </span>
                              {report.feedbackComment}
                            </p>
                          )}

                          <div className="text-[10px] text-slate-400 text-right">
                            {dateStr}
                          </div>
                        </div>
                      );
                    })}

                    {myReports.length > displayedReports.length && (
                      <div className="text-center pt-2 col-span-full">
                        <button
                          type="button"
                          onClick={() => onChangeTab('daily_report')}
                          className="text-xs text-teal-600 hover:text-teal-700 font-bold hover:underline cursor-pointer"
                        >
                          他 {myReports.length - displayedReports.length} 件の日報・週報をすべて表示 →
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs col-span-full">
                    関連する日報・週報はありません
                  </div>
                );
              })()}
            </div>
          </MyPageSectionCard>
        );
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 rounded-xl border border-slate-200 h-[calc(100vh-8rem)] p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* 代理ログイン中通知カード */}
      {impersonatorAdmin && (
        <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/15 border-2 border-amber-400/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 bg-amber-500 text-white text-xs font-black rounded-md shadow-2xs tracking-wider">
                  代理ログイン中
                </span>
                <span className="text-sm sm:text-base font-bold text-slate-800">
                  現在「<strong className="underline decoration-amber-400 underline-offset-2">{user.name}</strong>」さんのアカウントでログインしています
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                元の管理者: <strong className="font-bold text-slate-800">{impersonatorAdmin.name}</strong>（{impersonatorAdmin.department || impersonatorAdmin.division || 'システム管理者'}）
                <span className="hidden sm:inline"> — 確認や設定が完了したら、ワンクリックで元の管理者権限に戻ることができます。</span>
              </p>
            </div>
          </div>
          {onRevertToAdmin && (
            <button
              type="button"
              onClick={onRevertToAdmin}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl shadow-xs hover:shadow transition-all flex items-center gap-2 cursor-pointer shrink-0 border border-amber-600/70"
              title="ワンクリックで元の管理者アカウントに復帰します"
            >
              <Undo2 className="w-4 h-4" />
              <span>管理者（{impersonatorAdmin.name}）に戻る</span>
            </button>
          )}
        </div>
      )}

      {/* 未読・要対応通知サマリーカード（カード幅140px以上で通常カード、140px未満でアイコン＋バッジに自動切替） */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 sm:gap-3">
        {/* スケジュール */}
        <div
          onClick={() => onChangeTab?.('calendar')}
          className={`@container rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md hover:border-amber-400 group ${
            unreadEvents.length > 0
              ? 'bg-amber-50/70 border-amber-300 text-amber-950'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
          title={unreadEvents.length > 0 ? `スケジュール（未確認 ${unreadEvents.length}件）` : 'スケジュール（確認済）'}
        >
          <div className="flex items-center justify-center @[140px]:justify-start gap-2.5 p-2.5 @[140px]:p-3">
            <div
              onClick={(e) => {
                e.stopPropagation();
                onChangeTab?.('calendar');
              }}
              className="relative p-2 bg-amber-100 group-hover:bg-amber-200 text-amber-700 rounded-lg shrink-0 transition-transform group-hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            >
              <CalendarIcon className="w-5 h-5" />
              {unreadEvents.length > 0 ? (
                <span className="flex @[140px]:hidden absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-rose-500 text-white font-extrabold text-[10px] rounded-full items-center justify-center shadow-xs ring-2 ring-white animate-pulse">
                  {unreadEvents.length > 99 ? '99+' : unreadEvents.length}
                </span>
              ) : (
                <span className="flex @[140px]:hidden absolute -bottom-1 -right-1 w-4 h-4 bg-slate-100 text-slate-500 rounded-full items-center justify-center ring-2 ring-white">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
              )}
            </div>
            <div className="hidden @[140px]:block flex-1 min-w-0">
              <div className="text-[11px] sm:text-xs font-bold text-slate-600 group-hover:text-amber-800 transition-colors truncate whitespace-nowrap">
                スケジュール
              </div>
              <div className="mt-0.5 sm:mt-1">
                {unreadEvents.length > 0 ? (
                  <span className="inline-flex items-center px-2 py-0.5 bg-rose-500 text-white font-extrabold text-[10px] sm:text-[11px] rounded-full whitespace-nowrap animate-pulse shadow-2xs">
                    未確認 {unreadEvents.length}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] sm:text-[11px] rounded-full whitespace-nowrap">
                    確認済
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 掲示板 */}
        <div
          onClick={() => onChangeTab?.('board')}
          className={`@container rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md hover:border-indigo-400 group ${
            unreadTopics.length > 0
              ? 'bg-indigo-50/70 border-indigo-300 text-indigo-950'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
          title={unreadTopics.length > 0 ? `掲示板（未読 ${unreadTopics.length}件）` : '掲示板（既読）'}
        >
          <div className="flex items-center justify-center @[140px]:justify-start gap-2.5 p-2.5 @[140px]:p-3">
            <div
              onClick={(e) => {
                e.stopPropagation();
                onChangeTab?.('board');
              }}
              className="relative p-2 bg-indigo-100 group-hover:bg-indigo-200 text-indigo-700 rounded-lg shrink-0 transition-transform group-hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            >
              <Monitor className="w-5 h-5" />
              {unreadTopics.length > 0 ? (
                <span className="flex @[140px]:hidden absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-indigo-600 text-white font-extrabold text-[10px] rounded-full items-center justify-center shadow-xs ring-2 ring-white">
                  {unreadTopics.length > 99 ? '99+' : unreadTopics.length}
                </span>
              ) : (
                <span className="flex @[140px]:hidden absolute -bottom-1 -right-1 w-4 h-4 bg-slate-100 text-slate-500 rounded-full items-center justify-center ring-2 ring-white">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
              )}
            </div>
            <div className="hidden @[140px]:block flex-1 min-w-0">
              <div className="text-[11px] sm:text-xs font-bold text-slate-600 group-hover:text-indigo-800 transition-colors truncate whitespace-nowrap">
                掲示板
              </div>
              <div className="mt-0.5 sm:mt-1">
                {unreadTopics.length > 0 ? (
                  <span className="inline-flex items-center px-2 py-0.5 bg-indigo-600 text-white font-extrabold text-[10px] sm:text-[11px] rounded-full whitespace-nowrap shadow-2xs">
                    未読 {unreadTopics.length}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] sm:text-[11px] rounded-full whitespace-nowrap">
                    既読
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 伝言メモ */}
        <div
          onClick={() => onChangeTab?.('memo')}
          className={`@container rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md hover:border-rose-400 group ${
            unhandledMemos.length > 0
              ? 'bg-rose-50/70 border-rose-300 text-rose-950'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
          title={unhandledMemos.length > 0 ? `伝言メモ（未対応 ${unhandledMemos.length}件）` : '伝言メモ（対応済）'}
        >
          <div className="flex items-center justify-center @[140px]:justify-start gap-2.5 p-2.5 @[140px]:p-3">
            <div
              onClick={(e) => {
                e.stopPropagation();
                onChangeTab?.('memo');
              }}
              className="relative p-2 bg-rose-100 group-hover:bg-rose-200 text-rose-700 rounded-lg shrink-0 transition-transform group-hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            >
              <Phone className="w-5 h-5" />
              {unhandledMemos.length > 0 ? (
                <span className="flex @[140px]:hidden absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-rose-600 text-white font-extrabold text-[10px] rounded-full items-center justify-center shadow-xs ring-2 ring-white">
                  {unhandledMemos.length > 99 ? '99+' : unhandledMemos.length}
                </span>
              ) : (
                <span className="flex @[140px]:hidden absolute -bottom-1 -right-1 w-4 h-4 bg-slate-100 text-slate-500 rounded-full items-center justify-center ring-2 ring-white">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
              )}
            </div>
            <div className="hidden @[140px]:block flex-1 min-w-0">
              <div className="text-[11px] sm:text-xs font-bold text-slate-600 group-hover:text-rose-800 transition-colors truncate whitespace-nowrap">
                伝言メモ
              </div>
              <div className="mt-0.5 sm:mt-1">
                {unhandledMemos.length > 0 ? (
                  <span className="inline-flex items-center px-2 py-0.5 bg-rose-600 text-white font-extrabold text-[10px] sm:text-[11px] rounded-full whitespace-nowrap shadow-2xs">
                    未対応 {unhandledMemos.length}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] sm:text-[11px] rounded-full whitespace-nowrap">
                    対応済
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ワークフロー */}
        <div
          onClick={() => onChangeTab?.('workflow')}
          className={`@container rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md hover:border-purple-400 group ${
            pendingApprovals.length > 0
              ? 'bg-purple-50/70 border-purple-300 text-purple-950'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
          title={pendingApprovals.length > 0 ? `ワークフロー（要承認 ${pendingApprovals.length}件）` : 'ワークフロー（処理済）'}
        >
          <div className="flex items-center justify-center @[140px]:justify-start gap-2.5 p-2.5 @[140px]:p-3">
            <div
              onClick={(e) => {
                e.stopPropagation();
                onChangeTab?.('workflow');
              }}
              className="relative p-2 bg-purple-100 group-hover:bg-purple-200 text-purple-700 rounded-lg shrink-0 transition-transform group-hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            >
              <FileText className="w-5 h-5" />
              {pendingApprovals.length > 0 ? (
                <span className="flex @[140px]:hidden absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-purple-600 text-white font-extrabold text-[10px] rounded-full items-center justify-center shadow-xs ring-2 ring-white">
                  {pendingApprovals.length > 99 ? '99+' : pendingApprovals.length}
                </span>
              ) : (
                <span className="flex @[140px]:hidden absolute -bottom-1 -right-1 w-4 h-4 bg-slate-100 text-slate-500 rounded-full items-center justify-center ring-2 ring-white">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
              )}
            </div>
            <div className="hidden @[140px]:block flex-1 min-w-0">
              <div className="text-[11px] sm:text-xs font-bold text-slate-600 group-hover:text-purple-800 transition-colors truncate whitespace-nowrap">
                ワークフロー
              </div>
              <div className="mt-0.5 sm:mt-1">
                {pendingApprovals.length > 0 ? (
                  <span className="inline-flex items-center px-2 py-0.5 bg-purple-600 text-white font-extrabold text-[10px] sm:text-[11px] rounded-full whitespace-nowrap shadow-2xs">
                    要承認 {pendingApprovals.length}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] sm:text-[11px] rounded-full whitespace-nowrap">
                    処理済
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* チャット */}
        <div
          onClick={() => onChangeTab?.('chat')}
          className={`@container rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md hover:border-blue-400 group ${
            unreadChatRooms.length > 0
              ? 'bg-blue-50/70 border-blue-300 text-blue-950'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
          title={unreadChatRooms.length > 0 ? `チャットルーム（未読 ${unreadChatRooms.length}件）` : 'チャットルーム（既読）'}
        >
          <div className="flex items-center justify-center @[140px]:justify-start gap-2.5 p-2.5 @[140px]:p-3">
            <div
              onClick={(e) => {
                e.stopPropagation();
                onChangeTab?.('chat');
              }}
              className="relative p-2 bg-blue-100 group-hover:bg-blue-200 text-blue-700 rounded-lg shrink-0 transition-transform group-hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            >
              <MessageSquare className="w-5 h-5" />
              {unreadChatRooms.length > 0 ? (
                <span className="flex @[140px]:hidden absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-blue-600 text-white font-extrabold text-[10px] rounded-full items-center justify-center shadow-xs ring-2 ring-white">
                  {unreadChatRooms.length > 99 ? '99+' : unreadChatRooms.length}
                </span>
              ) : (
                <span className="flex @[140px]:hidden absolute -bottom-1 -right-1 w-4 h-4 bg-slate-100 text-slate-500 rounded-full items-center justify-center ring-2 ring-white">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
              )}
            </div>
            <div className="hidden @[140px]:block flex-1 min-w-0">
              <div className="text-[11px] sm:text-xs font-bold text-slate-600 group-hover:text-blue-800 transition-colors truncate whitespace-nowrap">
                チャットルーム
              </div>
              <div className="mt-0.5 sm:mt-1">
                {unreadChatRooms.length > 0 ? (
                  <span className="inline-flex items-center px-2 py-0.5 bg-blue-600 text-white font-extrabold text-[10px] sm:text-[11px] rounded-full whitespace-nowrap shadow-2xs">
                    未読 {unreadChatRooms.length}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] sm:text-[11px] rounded-full whitespace-nowrap">
                    既読
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 日報・週報 */}
        <div
          onClick={() => onChangeTab?.('daily_report')}
          className={`@container rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md hover:border-teal-400 group ${
            unreadReports.length > 0
              ? 'bg-teal-50/70 border-teal-300 text-teal-950'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
          title={unreadReports.length > 0 ? `日報・週報（未確認 ${unreadReports.length}件）` : '日報・週報（確認済）'}
        >
          <div className="flex items-center justify-center @[140px]:justify-start gap-2.5 p-2.5 @[140px]:p-3">
            <div
              onClick={(e) => {
                e.stopPropagation();
                onChangeTab?.('daily_report');
              }}
              className="relative p-2 bg-teal-100 group-hover:bg-teal-200 text-teal-700 rounded-lg shrink-0 transition-transform group-hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            >
              <ClipboardList className="w-5 h-5" />
              {unreadReports.length > 0 ? (
                <span className="flex @[140px]:hidden absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-teal-600 text-white font-extrabold text-[10px] rounded-full items-center justify-center shadow-xs ring-2 ring-white">
                  {unreadReports.length > 99 ? '99+' : unreadReports.length}
                </span>
              ) : (
                <span className="flex @[140px]:hidden absolute -bottom-1 -right-1 w-4 h-4 bg-slate-100 text-slate-500 rounded-full items-center justify-center ring-2 ring-white">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
              )}
            </div>
            <div className="hidden @[140px]:block flex-1 min-w-0">
              <div className="text-[11px] sm:text-xs font-bold text-slate-600 group-hover:text-teal-800 transition-colors truncate whitespace-nowrap">
                日報・週報
              </div>
              <div className="mt-0.5 sm:mt-1">
                {unreadReports.length > 0 ? (
                  <span className="inline-flex items-center px-2 py-0.5 bg-teal-600 text-white font-extrabold text-[10px] sm:text-[11px] rounded-full whitespace-nowrap shadow-2xs">
                    未確認 {unreadReports.length}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] sm:text-[11px] rounded-full whitespace-nowrap">
                    確認済
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* プロジェクト・マイタスク */}
        <div
          onClick={() => {
            if (onNavigateToContent) {
              onNavigateToContent({ tab: 'projects', projectView: 'mytasks' });
            } else {
              onChangeTab?.('projects');
            }
          }}
          className={`@container rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md hover:border-emerald-400 group ${
            myProjectSummary.overdueCount > 0
              ? 'bg-rose-50/70 border-rose-300 text-rose-950'
              : myProjectSummary.myPendingCount > 0
              ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
          title={
            myProjectSummary.overdueCount > 0
              ? `プロジェクト・マイタスク（期限超過 ${myProjectSummary.overdueCount}件）`
              : myProjectSummary.myPendingCount > 0
              ? `プロジェクト・マイタスク（未完了 ${myProjectSummary.myPendingCount}件）`
              : 'プロジェクト・マイタスク（完了済）'
          }
        >
          <div className="flex items-center justify-center @[140px]:justify-start gap-2.5 p-2.5 @[140px]:p-3">
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (onNavigateToContent) {
                  onNavigateToContent({ tab: 'projects', projectView: 'mytasks' });
                } else {
                  onChangeTab?.('projects');
                }
              }}
              className="relative p-2 bg-emerald-100 group-hover:bg-emerald-200 text-emerald-700 rounded-lg shrink-0 transition-transform group-hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            >
              <FolderKanban className="w-5 h-5" />
              {myProjectSummary.overdueCount > 0 ? (
                <span className="flex @[140px]:hidden absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-rose-600 text-white font-extrabold text-[10px] rounded-full items-center justify-center shadow-xs ring-2 ring-white animate-pulse">
                  {myProjectSummary.overdueCount > 99 ? '99+' : myProjectSummary.overdueCount}
                </span>
              ) : myProjectSummary.myPendingCount > 0 ? (
                <span className="flex @[140px]:hidden absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-emerald-600 text-white font-extrabold text-[10px] rounded-full items-center justify-center shadow-xs ring-2 ring-white">
                  {myProjectSummary.myPendingCount > 99 ? '99+' : myProjectSummary.myPendingCount}
                </span>
              ) : (
                <span className="flex @[140px]:hidden absolute -bottom-1 -right-1 w-4 h-4 bg-slate-100 text-slate-500 rounded-full items-center justify-center ring-2 ring-white">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
              )}
            </div>
            <div className="hidden @[140px]:block flex-1 min-w-0">
              <div className="text-[11px] sm:text-xs font-bold text-slate-600 group-hover:text-emerald-800 transition-colors truncate whitespace-nowrap">
                プロジェクト
              </div>
              <div className="mt-0.5 sm:mt-1">
                {myProjectSummary.overdueCount > 0 ? (
                  <span className="inline-flex items-center px-2 py-0.5 bg-rose-600 text-white font-extrabold text-[10px] sm:text-[11px] rounded-full whitespace-nowrap shadow-2xs">
                    期限超過 {myProjectSummary.overdueCount}
                  </span>
                ) : myProjectSummary.myPendingCount > 0 ? (
                  <span className="inline-flex items-center px-2 py-0.5 bg-emerald-600 text-white font-extrabold text-[10px] sm:text-[11px] rounded-full whitespace-nowrap shadow-2xs">
                    未完了 {myProjectSummary.myPendingCount}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] sm:text-[11px] rounded-full whitespace-nowrap">
                    完了済
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* メインセクションツールバー（表示件数・環境設定 / 順序変更案内） */}
      <div className="flex items-center justify-between gap-3 px-1 pt-1">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <span>マイページ ウィジェット</span>
          <span className="text-[11px] text-slate-400 font-normal hidden sm:inline">（各カードのドラッグで並び替え、歯車アイコンで件数設定）</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleOpenDisplaySettings()}
            className="px-2.5 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 hover:border-indigo-300 rounded-lg shadow-2xs hover:shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            title="各項目の表示件数や環境設定を変更"
          >
            <Settings className="w-3.5 h-3.5 text-indigo-600" />
            <span>表示件数・環境設定</span>
          </button>
          <button
            type="button"
            onClick={handleResetOrder}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all cursor-pointer border border-transparent hover:border-slate-200 hover:shadow-2xs"
            title="並び順を初期状態にリセット"
            aria-label="並び順を初期状態にリセット"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* メインセクション（D&Dで順序変更可能） */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {sectionOrder.map((sectionId, index) =>
            isMyPageSectionVisibleByMenu(user, sectionId) ? renderSectionCard(sectionId, index) : null
          )}
        </div>

        {/* 最下部の並び順リセット＆表示設定 */}
        <div className="flex justify-end items-center gap-2 pt-1 pb-2 px-1">
          <button
            type="button"
            onClick={() => handleOpenDisplaySettings()}
            className="px-2 py-1 text-[11px] text-slate-500 hover:text-indigo-600 hover:bg-white rounded-lg transition-all cursor-pointer border border-transparent hover:border-slate-200 hover:shadow-2xs flex items-center gap-1"
            title="表示件数・環境設定"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>表示設定</span>
          </button>
          <button
            type="button"
            onClick={handleResetOrder}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all cursor-pointer border border-transparent hover:border-slate-200 hover:shadow-2xs"
            title="並び順を初期状態にリセット"
            aria-label="並び順を初期状態にリセット"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* スケジュール詳細モーダル */}
      {selectedEvent && (
        <GlobalEventDetailModal
          isOpen={!!selectedEvent}
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEdit={(evt) => {
            setSelectedEvent(null);
            setEditingEvent(evt);
            setIsCopyMode(false);
            setIsEventModalOpen(true);
          }}
          onCopyAndAdd={(evt) => {
            setSelectedEvent(null);
            setEditingEvent(evt);
            setIsCopyMode(true);
            setIsEventModalOpen(true);
          }}
          onDelete={(evt, scope, instanceDate) => {
            if (onDeleteEvent) {
              onDeleteEvent(evt.id, scope || 'all', instanceDate || evt.instanceDate);
            }
            setSelectedEvent(null);
          }}
          onEditInCalendar={(eventId) => {
            setSelectedEvent(null);
            if (onNavigateToContent) {
              onNavigateToContent({ tab: 'calendar', eventId });
            } else {
              onChangeTab('calendar');
            }
          }}
          currentUser={user}
        />
      )}

      {/* 掲示板トピック詳細モーダル */}
      {selectedTopic && (
        <TopicDetailModal
          isOpen={!!selectedTopic}
          topic={selectedTopic}
          currentUser={user}
          onClose={() => setSelectedTopic(null)}
          onUpdateTopic={(updated) => {
            setSelectedTopic(updated);
            if (onUpdateTopic) onUpdateTopic(updated);
          }}
          offices={offices}
          divisions={divisions}
          users={allUsers}
          onUpdateUser={onUpdateUser}
        />
      )}

      {/* スケジュール新規作成・編集モーダル */}
      <EventModal
        isOpen={isEventModalOpen}
        onClose={() => {
          setIsEventModalOpen(false);
          setEditingEvent(null);
          setIsCopyMode(false);
        }}
        onSave={async (eventData) => {
          if ('id' in eventData && eventData.id) {
            if (onUpdateEvent) {
              await onUpdateEvent(eventData as CalendarEvent);
            }
          } else if (onAddEvent) {
            await onAddEvent(eventData as Omit<CalendarEvent, 'id'>);
          }
          setIsEventModalOpen(false);
          setEditingEvent(null);
          setIsCopyMode(false);
        }}
        onDelete={onDeleteEvent}
        editingEvent={editingEvent}
        isCopyMode={isCopyMode}
        offices={offices}
        divisions={divisions}
        allUsers={allUsers}
        currentUser={user}
      />

      {/* 掲示板新規作成モーダル */}
      <TopicCreateModal
        isOpen={isCreateTopicModalOpen}
        onClose={() => setIsCreateTopicModalOpen(false)}
        onSubmit={async (topicData) => {
          if (onAddTopic) {
            await onAddTopic(topicData);
          }
          setIsCreateTopicModalOpen(false);
        }}
        currentUser={user}
        users={allUsers}
        offices={offices}
        divisions={divisions}
        existingTags={existingTags}
      />

      {/* ワークフロー新規申請モーダル */}
      <ApplicationModal
        isOpen={isCreateApplicationOpen}
        onClose={() => setIsCreateApplicationOpen(false)}
        onSave={async (appData) => {
          if (onAddApplication) {
            await onAddApplication(appData);
          }
          setIsCreateApplicationOpen(false);
        }}
        allUsers={allUsers}
        currentUser={user}
        approvalFlows={approvalFlows}
        itemMasters={itemMasters}
        applications={applications}
        offices={offices}
        initialType={createAppInitialType}
      />

      {/* マイページ表示件数・環境設定モーダル */}
      <MyPageDisplaySettingsModal
        isOpen={isDisplaySettingsOpen}
        onClose={() => {
          setIsDisplaySettingsOpen(false);
          setTargetSettingsSectionId(null);
        }}
        currentCounts={sectionCounts}
        currentEnvSettings={envSettings}
        targetSectionId={targetSettingsSectionId}
        hiddenSectionIds={getHiddenMyPageSectionIdsByMenu(user)}
        onSave={handleSaveDisplaySettings}
      />
    </div>
  );
}
