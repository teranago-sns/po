import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  User,
  OfficeMaster,
  DivisionMaster,
  PositionMaster,
  EmailNotificationSettings,
  ToggleableMenuKey,
  MyPageSectionCounts,
  MyPageEnvSettings,
} from '../types';
import { getAvatarUrl, SILHOUETTE_SVG, optimizeAvatarFile } from '../utils/avatar';
import { API_BASE_URL } from '../config/api';
import { ConfirmModal, ConfirmModalState } from './ConfirmModal';
import {
  getPushNotificationStatus,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  sendTestPushNotification,
  runPushDiagnostics,
  PushStatus,
  PushDiagnosticReport,
} from '../utils/pushNotifications';
import {
  User as UserIcon,
  Calendar as CalendarIcon,
  Monitor,
  FileText,
  Check,
  AlertCircle,
  Users,
  X,
  MessageSquare,
  CheckCircle2,
  Settings,
  Copy,
  RefreshCw,
  Upload,
  Trash2,
  LogOut,
  BellRing,
  BellOff,
  Smartphone,
  Send,
  Loader2,
  Info,
  Wrench,
  AlertTriangle,
  Undo2,
  RotateCcw,
  SlidersHorizontal,
  Mail,
  Sparkles,
  ShieldCheck,
  Lock,
  ChevronDown,
  ChevronUp,
  Type,
  FolderKanban,
  ClipboardList,
  LayoutGrid,
  FileCheck2,
  HardHat,
  Boxes,
} from 'lucide-react';
import {
  FONT_SIZE_OPTIONS,
  getSavedFontSize,
  applyFontSize,
  THEME_OPTIONS,
  getSavedTheme,
  applyColorTheme,
} from '../utils/theme';
import {
  TOGGLEABLE_MENUS,
  DEFAULT_MENU_VISIBILITY,
  getMenuVisibilitySettings,
  getHiddenMyPageSectionIdsByMenu,
  getToggleableMenuLabel,
} from '../utils/menuVisibility';
import {
  MyPageDisplaySettingsModal,
  DEFAULT_SECTION_COUNTS,
  DEFAULT_ENV_SETTINGS,
} from './MyPageDisplaySettingsModal';

export type PersonalSettingsFocusSection = 'push' | 'emergency' | null;

interface PersonalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  positions?: PositionMaster[];
  allUsers?: User[];
  onUpdateUser?: (updatedUser: User) => void;
  onLogout?: () => void;
  impersonatorAdmin?: User | null;
  onRevertToAdmin?: () => void;
  initialFocusSection?: PersonalSettingsFocusSection;
}

export function PersonalSettingsModal({
  isOpen,
  onClose,
  user,
  offices = [],
  divisions = [],
  positions = [],
  allUsers = [],
  onUpdateUser,
  onLogout,
  impersonatorAdmin,
  onRevertToAdmin,
  initialFocusSection = null,
}: PersonalSettingsModalProps) {
  // Web Push 通知状態管理
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushProgressStep, setPushProgressStep] = useState<string>('');
  const [pushMessage, setPushMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [diagModalOpen, setDiagModalOpen] = useState(false);
  const [diagReport, setDiagReport] = useState<PushDiagnosticReport | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const refreshPushStatus = async () => {
    if (user?.id) {
      const st = await getPushNotificationStatus(user.id);
      setPushStatus(st);
    }
  };

  useEffect(() => {
    if (isOpen && user?.id) {
      refreshPushStatus();
    }
  }, [isOpen, user?.id]);

  // 表示件数・環境設定状態管理（個人設定内のショートカットから他画面上でも開けるように保持）
  const [isDisplaySettingsOpen, setIsDisplaySettingsOpen] = useState(false);

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

    try {
      localStorage.setItem(`user_preferences_${user.id}`, JSON.stringify(mergedPrefs));
    } catch (_) {}

    try {
      await fetch(`${API_BASE_URL}/users/${user.id}/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mergedPrefs),
      });
    } catch (err) {
      console.warn('Failed to sync display settings to server:', err);
    }

    if (onUpdateUser) {
      onUpdateUser({
        ...user,
        preferences: mergedPrefs,
      });
    }
  };

  const handleRunDiagnostics = async () => {
    setDiagLoading(true);
    setDiagModalOpen(true);
    const report = await runPushDiagnostics();
    setDiagReport(report);
    setDiagLoading(false);
  };

  const handleEnablePush = async () => {
    if (!user?.id) return;
    setPushLoading(true);
    setPushProgressStep('📍 [1/5] 初期化中...');
    setPushMessage(null);

    const res = await subscribeToPushNotifications(user.id, (stepMsg) => {
      setPushProgressStep(stepMsg);
    });

    if (res.success) {
      setPushMessage({ type: 'success', text: res.message || 'スマートフォンへのプッシュ通知を有効にしました！' });
      await refreshPushStatus();
    } else {
      setPushMessage({ type: 'error', text: res.error || '通知の登録に失敗しました。' });
    }
    setPushLoading(false);
    setPushProgressStep('');
  };

  const handleDisablePush = async () => {
    if (!user?.id) return;
    setPushLoading(true);
    setPushMessage(null);
    const res = await unsubscribeFromPushNotifications(user.id);
    if (res.success) {
      setPushMessage({ type: 'info', text: '通知の購読を解除しました。' });
      await refreshPushStatus();
    } else {
      setPushMessage({ type: 'error', text: res.error || '通知の解除に失敗しました。' });
    }
    setPushLoading(false);
  };

  const handleTestPush = async () => {
    if (!user?.id) return;
    setPushLoading(true);
    setPushMessage(null);
    const res = await sendTestPushNotification(user.id);
    if (res.success) {
      setPushMessage({ type: 'success', text: res.message || 'テスト通知を送信しました！数秒で通知が届きます。' });
    } else {
      setPushMessage({ type: 'error', text: res.error || 'テスト通知の送信に失敗しました。' });
    }
    setPushLoading(false);
  };

  // アバターアップロード状態
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('画像サイズは2MB以下にしてください。');
      return;
    }

    setAvatarUploading(true);
    setAvatarError(null);

    try {
      // 登録画像の縮小表示が粗くならないよう、正方形プレスケール・高品質リサイズ処理を実行
      const fileToUpload = await optimizeAvatarFile(file);

      const formData = new FormData();
      formData.append('avatar', fileToUpload);

      const response = await fetch(`${API_BASE_URL}/upload-avatar`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.avatarUrl) {
          setSettingsForm((prev) => ({ ...prev, avatarUrl: data.avatarUrl }));
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        setAvatarError(errData.error || 'アップロードに失敗しました。');
      }
    } catch (error: any) {
      setAvatarError('通信エラー: ' + error.message);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = () => {
    setSettingsForm((prev) => ({ ...prev, avatarUrl: '' }));
    setAvatarError(null);
  };

  // 設定フォーム状態
  const [settingsForm, setSettingsForm] = useState<User>(user);

  // 通知センター (メール送信カテゴリ設定)
  const NOTIFICATION_CATEGORIES: {
    key: keyof EmailNotificationSettings;
    label: string;
    desc: string;
    icon: React.ReactNode;
  }[] = useMemo(
    () => [
      {
        key: 'schedule',
        label: 'スケジュール',
        desc: '自分の参加予定・変更・同行登録',
        icon: <CalendarIcon className="w-4 h-4 text-amber-500 shrink-0" />,
      },
      {
        key: 'bulletin',
        label: '掲示板',
        desc: '新規投稿・閲覧依頼トピック・全体告知',
        icon: <FileText className="w-4 h-4 text-emerald-500 shrink-0" />,
      },
      {
        key: 'memo',
        label: '伝言メモ',
        desc: '自分宛ての電話伝言・折り返し依頼',
        icon: <MessageSquare className="w-4 h-4 text-purple-500 shrink-0" />,
      },
      {
        key: 'workflow',
        label: 'ワークフロー・申請',
        desc: '承認依頼・決裁判定・差戻し通知',
        icon: <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />,
      },
      {
        key: 'post',
        label: '社内SNS・タイムライン',
        desc: '自分への返信・@メンション通知',
        icon: <Users className="w-4 h-4 text-indigo-500 shrink-0" />,
      },
      {
        key: 'inspection',
        label: '点検・報告書',
        desc: '日報・点検票の提出・レビュー依頼',
        icon: <Wrench className="w-4 h-4 text-rose-500 shrink-0" />,
      },
      {
        key: 'project',
        label: 'プロジェクト・Todo',
        desc: '担当タスクへのアサイン・カード内コメント通知',
        icon: <FolderKanban className="w-4 h-4 text-emerald-600 shrink-0" />,
      },
    ],
    []
  );

  const [emailTestLoading, setEmailTestLoading] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSendTestEmail = async (targetEmail: string, label: string) => {
    if (!targetEmail || !targetEmail.trim()) {
      setEmailTestResult({ type: 'error', message: `${label}のアドレスが未入力です。` });
      return;
    }
    setEmailTestLoading(true);
    setEmailTestResult(null);

    try {
      const res = await fetch(`${API_BASE_URL}/email/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: targetEmail.trim(),
          recipientName: settingsForm.name,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setEmailTestResult({
          type: 'success',
          message: `${label} (${targetEmail.trim()}) へテストメールを正常送信しました。`,
        });
      } else {
        setEmailTestResult({ type: 'error', message: data.error || 'テストメール送信エラー' });
      }
    } catch (err: any) {
      setEmailTestResult({ type: 'error', message: `送信エラー: ${err?.message || '接続不可'}` });
    } finally {
      setEmailTestLoading(false);
    }
  };

  // アコーディオン開閉状態 & 安否確認 個人メール暗号化設定用状態
  const [isAppearanceSettingsOpen, setIsAppearanceSettingsOpen] = useState(false);
  const [isMenuVisibilitySettingsOpen, setIsMenuVisibilitySettingsOpen] = useState(false);
  const [isEmergencyEmailOpen, setIsEmergencyEmailOpen] = useState(false);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [isICalOpen, setIsICalOpen] = useState(false);
  const [isWebPushOpen, setIsWebPushOpen] = useState(false);
  const [personalEmailInput, setPersonalEmailInput] = useState('');
  const [personalEmailSaving, setPersonalEmailSaving] = useState(false);
  const [personalEmailTesting, setPersonalEmailTesting] = useState(false);
  const [personalEmailResult, setPersonalEmailResult] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const [copiedICal, setCopiedICal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });
  const emergencySectionRef = useRef<HTMLDivElement>(null);
  const webPushSectionRef = useRef<HTMLDivElement>(null);
  const personalEmailInputRef = useRef<HTMLInputElement>(null);

  const handleSavePersonalEmail = async () => {
    if (!user?.id) return;
    if (!personalEmailInput.trim()) {
      setPersonalEmailResult({ type: 'error', message: '個人メールアドレスを入力してください。' });
      return;
    }
    setPersonalEmailSaving(true);
    setPersonalEmailResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/users/${user.id}/personal-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalEmail: personalEmailInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPersonalEmailResult({
          type: 'success',
          message: '個人メールアドレスをAES-256-GCM暗号化して安全に保存しました。',
        });
        setPersonalEmailInput('');
        const updatedUser = {
          ...settingsForm,
          personalEmailMasked: data.personalEmailMasked,
        };
        setSettingsForm(updatedUser);
        if (onUpdateUser) onUpdateUser(updatedUser);
      } else {
        setPersonalEmailResult({ type: 'error', message: data.error || '個人メールアドレスの保存に失敗しました。' });
      }
    } catch (err: any) {
      setPersonalEmailResult({ type: 'error', message: '通信エラー: ' + err.message });
    } finally {
      setPersonalEmailSaving(false);
    }
  };

  const handleRemovePersonalEmail = async () => {
    if (!user?.id) return;
    setConfirmModal({
      isOpen: true,
      title: '個人メールアドレスの解除',
      message:
        '登録中の個人メールアドレスを解除（削除）しますか？\n解除すると災害発生時の個人宛て緊急メール通知は届かなくなります。',
      confirmText: '解除（削除）する',
      cancelText: 'キャンセル',
      type: 'warning',
      onConfirm: async () => {
        setPersonalEmailSaving(true);
        setPersonalEmailResult(null);
        try {
          const res = await fetch(`${API_BASE_URL}/users/${user.id}/personal-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personalEmail: '' }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            setPersonalEmailResult({ type: 'success', message: '個人メールアドレスの登録を解除しました。' });
            const updatedUser = {
              ...settingsForm,
              personalEmailMasked: undefined,
            };
            setSettingsForm(updatedUser);
            if (onUpdateUser) onUpdateUser(updatedUser);
          } else {
            setPersonalEmailResult({ type: 'error', message: data.error || '解除に失敗しました。' });
          }
        } catch (err: any) {
          setPersonalEmailResult({ type: 'error', message: '通信エラー: ' + err.message });
        } finally {
          setPersonalEmailSaving(false);
        }
      },
    });
  };

  const handleTestPersonalEmail = async () => {
    if (!user?.id) return;
    setPersonalEmailTesting(true);
    setPersonalEmailResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/users/${user.id}/personal-email/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalEmail: personalEmailInput.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPersonalEmailResult({ type: 'success', message: data.message || '緊急連絡先テストメールを送信しました！' });
      } else {
        setPersonalEmailResult({ type: 'error', message: data.error || 'テストメール送信に失敗しました。' });
      }
    } catch (err: any) {
      setPersonalEmailResult({ type: 'error', message: '送信エラー: ' + err.message });
    } finally {
      setPersonalEmailTesting(false);
    }
  };

  // デフォルト設定：すべてオフ
  const defaultEmailNotifs: EmailNotificationSettings = useMemo(
    () => ({
      schedule: { pc: false, mobile: false },
      bulletin: { pc: false, mobile: false },
      memo: { pc: false, mobile: false },
      workflow: { pc: false, mobile: false },
      post: { pc: false, mobile: false },
      inspection: { pc: false, mobile: false },
      project: { pc: false, mobile: false },
    }),
    []
  );

  // 推奨設定プリセット (伝言メモ・ワークフロー・点検報告書・プロジェクトをON、他をOFF)
  const RECOMMENDED_EMAIL_NOTIFS: EmailNotificationSettings = useMemo(
    () => ({
      schedule: { pc: false, mobile: false },
      bulletin: { pc: false, mobile: false },
      memo: { pc: true, mobile: true },
      workflow: { pc: true, mobile: true },
      post: { pc: false, mobile: false },
      inspection: { pc: true, mobile: true },
      project: { pc: true, mobile: true },
    }),
    []
  );

  const currentEmailNotifs: EmailNotificationSettings = useMemo(
    () => ({
      ...defaultEmailNotifs,
      ...(settingsForm.preferences?.emailNotifications || {}),
    }),
    [settingsForm.preferences?.emailNotifications, defaultEmailNotifs]
  );

  const handleToggleEmailNotif = (catKey: keyof EmailNotificationSettings, type: 'pc' | 'mobile') => {
    const curCat = currentEmailNotifs[catKey] || { pc: false, mobile: false };
    const updatedCat = { ...curCat, [type]: !curCat[type] };
    const updatedPrefs = {
      ...(settingsForm.preferences || {}),
      emailNotifications: {
        ...currentEmailNotifs,
        [catKey]: updatedCat,
      },
    };
    setSettingsForm({ ...settingsForm, preferences: updatedPrefs });
  };

  const handleBatchSetEmailNotif = (mode: 'recommended' | 'all_pc_on' | 'all_mobile_on' | 'all_off') => {
    let updated: EmailNotificationSettings;

    if (mode === 'recommended') {
      updated = { ...RECOMMENDED_EMAIL_NOTIFS };
    } else {
      updated = { ...currentEmailNotifs };
      const keys: (keyof EmailNotificationSettings)[] = [
        'schedule',
        'bulletin',
        'memo',
        'workflow',
        'post',
        'inspection',
        'project',
      ];

      keys.forEach((k) => {
        const cur = updated[k] || { pc: false, mobile: false };
        if (mode === 'all_pc_on') {
          updated[k] = { ...cur, pc: true };
        } else if (mode === 'all_mobile_on') {
          updated[k] = { ...cur, mobile: true };
        } else {
          updated[k] = { pc: false, mobile: false };
        }
      });
    }

    setSettingsForm({
      ...settingsForm,
      preferences: {
        ...(settingsForm.preferences || {}),
        emailNotifications: updated,
      },
    });
  };

  const getInitialUserWithPrefs = (u: User): User => {
    let cachedPrefs: any = null;
    try {
      const str = localStorage.getItem(`user_preferences_${u.id}`);
      if (str) cachedPrefs = JSON.parse(str);
    } catch (_) {}

    const mergedPrefs = {
      fontSize: getSavedFontSize(),
      colorTheme: getSavedTheme(),
      ...(u.preferences || {}),
      ...(cachedPrefs || {}),
      emailNotifications: {
        ...(u.preferences?.emailNotifications || {}),
        ...(cachedPrefs?.emailNotifications || {}),
      },
      menuVisibility: {
        ...(cachedPrefs?.menuVisibility || {}),
        ...(u.preferences?.menuVisibility || {}),
      },
    };

    return {
      ...u,
      preferences: mergedPrefs,
    };
  };

  // モーダルが開かれた時のフォーム初期化・フォーカスセクション自動展開処理
  useEffect(() => {
    if (!isOpen) return;
    setSettingsForm(getInitialUserWithPrefs(user));
    setAvatarError(null);
    setEmailTestResult(null);
    setPersonalEmailResult(null);
    setPushMessage(null);

    if (initialFocusSection === 'emergency') {
      setIsEmergencyEmailOpen(true);
      setTimeout(() => {
        if (emergencySectionRef.current) {
          emergencySectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (personalEmailInputRef.current) {
          personalEmailInputRef.current.focus();
        }
      }, 250);
    } else if (initialFocusSection === 'push') {
      setIsWebPushOpen(true);
      setTimeout(() => {
        if (webPushSectionRef.current) {
          webPushSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 250);
    }
  }, [isOpen, initialFocusSection, user]);

  // Escapeキーで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !diagModalOpen && !isDisplaySettingsOpen && !confirmModal.isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, diagModalOpen, isDisplaySettingsOpen, confirmModal.isOpen, onClose]);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm.office) {
      setConfirmModal({
        isOpen: true,
        title: '入力エラー',
        message: '所属拠点を選択してください。',
        type: 'warning',
        confirmText: '確認',
      });
      return;
    }
    if (!settingsForm.division) {
      setConfirmModal({
        isOpen: true,
        title: '入力エラー',
        message: '所属部署を選択してください。',
        type: 'warning',
        confirmText: '確認',
      });
      return;
    }

    // ローカルストレージに個人設定・通知設定を即座にバックアップ
    const currentSavedFontSize = getSavedFontSize();
    const currentSavedTheme = getSavedTheme();

    const finalPreferences = {
      fontSize: currentSavedFontSize,
      colorTheme: currentSavedTheme,
      ...(settingsForm.preferences || {}),
    };

    try {
      localStorage.setItem(`user_preferences_${user.id}`, JSON.stringify(finalPreferences));
    } catch (_) {}

    // preferences 専用エンドポイントへも即座に送信（二重保護）
    fetch(`${API_BASE_URL}/users/${user.id}/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalPreferences),
    }).catch(() => {});

    if (onUpdateUser) {
      // マスターID/コード整合性を維持しつつ保存
      const matchedOffice = offices.find((o) => o.name === settingsForm.office);
      const matchedDivision = divisions.find((d) => d.name === settingsForm.division);
      const matchedPosition = positions.find((p) => p.name === settingsForm.position);
      const deptString = [settingsForm.office, settingsForm.division, settingsForm.position]
        .filter(Boolean)
        .join(' ');
      onUpdateUser({
        ...settingsForm,
        officeId: matchedOffice ? matchedOffice.id : settingsForm.officeId,
        divisionId: matchedDivision ? matchedDivision.id : settingsForm.divisionId,
        positionId: settingsForm.position ? (matchedPosition ? matchedPosition.id : settingsForm.positionId) : undefined,
        department: deptString,
        preferences: finalPreferences,
      });
    }
    onClose();
  };

  if (!isOpen && !isDisplaySettingsOpen && !diagModalOpen && !confirmModal.isOpen) {
    return null;
  }

  return (
    <>
      {/* 個人設定・カレンダー連携モーダル */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col border border-slate-100"
          >
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-bold">個人設定・カレンダー同期</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* 基本情報設定 */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-slate-100">
                  <UserIcon className="w-4 h-4 text-indigo-600" />
                  基本プロフィール情報
                </h3>

                {/* 顔写真（アバター）アップロード */}
                <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="relative shrink-0">
                    <img
                      src={getAvatarUrl(settingsForm.avatarUrl)}
                      alt="アバタープレビュー"
                      className="w-20 h-20 rounded-full border border-slate-200 shadow-xs object-cover bg-slate-100"
                    />
                    {avatarUploading && (
                      <div className="absolute inset-0 bg-slate-900/60 rounded-full flex items-center justify-center">
                        <RefreshCw className="w-5 h-5 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5 text-center sm:text-left flex-1">
                    <span className="block text-xs font-bold text-slate-700">マイ顔写真 (アバター)</span>
                    <span className="block text-[10px] text-slate-400">推奨サイズ: 正方形、2MB以下のJPG/PNG</span>

                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleAvatarChange}
                        accept="image/*"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={avatarUploading}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs shrink-0 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        写真をアップロード
                      </button>

                      {settingsForm.avatarUrl &&
                        settingsForm.avatarUrl !== SILHOUETTE_SVG &&
                        !settingsForm.avatarUrl.includes('data:image/svg+xml') && (
                          <button
                            type="button"
                            onClick={handleRemoveAvatar}
                            disabled={avatarUploading}
                            className="px-3 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            削除してシルエットに戻す
                          </button>
                        )}
                    </div>
                    {avatarError && (
                      <span className="block text-[10px] text-rose-500 font-semibold">{avatarError}</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">氏名</label>
                    <input
                      type="text"
                      id="teranago_mypage_user_name"
                      name="teranago_mypage_user_name"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                      value={settingsForm.name}
                      onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">フリガナ</label>
                    <input
                      type="text"
                      id="teranago_mypage_kana_name"
                      name="teranago_mypage_kana_name"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      value={settingsForm.kanaName || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, kanaName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">所属拠点</label>
                    <select
                      value={settingsForm.office || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const matched = offices.find((o) => o.name === val);
                        setSettingsForm({
                          ...settingsForm,
                          office: val,
                          officeId: matched ? matched.id : settingsForm.officeId,
                        });
                      }}
                      className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">-- 選択してください --</option>
                      {offices.map((off) => (
                        <option key={off.id} value={off.name}>
                          {off.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">所属部署</label>
                    <select
                      value={settingsForm.division || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const matched = divisions.find((d) => d.name === val);
                        setSettingsForm({
                          ...settingsForm,
                          division: val,
                          divisionId: matched ? matched.id : settingsForm.divisionId,
                        });
                      }}
                      className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                    >
                      <option value="">-- 選択してください --</option>
                      {divisions.map((div) => (
                        <option key={div.id} value={div.name}>
                          {div.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      役職 <span className="text-slate-400 font-normal text-[10px]">（任意 / 未設定時は空欄）</span>
                    </label>
                    <select
                      value={settingsForm.position || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const matched = positions.find((p) => p.name === val);
                        setSettingsForm({
                          ...settingsForm,
                          position: val,
                          positionId: val ? (matched ? matched.id : settingsForm.positionId) : undefined,
                        });
                      }}
                      className="w-full px-2.5 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">（役職なし / 空欄）</option>
                      {positions
                        .filter((pos) => pos.name !== '一般')
                        .map((pos) => (
                          <option key={pos.id} value={pos.name}>
                            {pos.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">メールアドレス</label>
                    <input
                      type="email"
                      id="teranago_mypage_work_email"
                      name="teranago_mypage_work_email"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={settingsForm.email || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, email: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">携帯メール</label>
                    <input
                      type="email"
                      id="teranago_mypage_mobile_email"
                      name="teranago_mypage_mobile_email"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={settingsForm.mobileEmail || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, mobileEmail: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">電話 (外線)</label>
                    <input
                      type="text"
                      id="teranago_mypage_phone_outside"
                      name="teranago_mypage_phone_outside"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      value={settingsForm.phoneOutside || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, phoneOutside: e.target.value })}
                      className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">電話 (内線)</label>
                    <input
                      type="text"
                      id="teranago_mypage_phone_extension"
                      name="teranago_mypage_phone_extension"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      value={settingsForm.phoneExtension || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, phoneExtension: e.target.value })}
                      className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">電話 (携帯)</label>
                    <input
                      type="text"
                      id="teranago_mypage_mobile_phone"
                      name="teranago_mypage_mobile_phone"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      value={settingsForm.mobilePhone || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, mobilePhone: e.target.value })}
                      className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* 上長設定 */}
                <div className="pt-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">上長（承認者）</label>
                  <select
                    value={settingsForm.supervisorId || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, supervisorId: e.target.value || undefined })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">（未設定）</option>
                    {allUsers
                      .filter((u) => u.id !== user.id) // 自分自身以外を上長に設定可能
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.office || ''} / {u.division || ''} / {u.position || ''})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* 🔤 画面表示・文字サイズ設定 (トグル折りたたみ) */}
              <div className="pt-4 border-t border-slate-100">
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white transition-all">
                  <button
                    type="button"
                    onClick={() => setIsAppearanceSettingsOpen((prev) => !prev)}
                    className="w-full p-3.5 bg-slate-50/80 hover:bg-slate-100/90 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center shrink-0">
                        <Type className="w-4 h-4 text-indigo-700" />
                      </div>
                      <div className="truncate">
                        <h3 className="text-xs font-bold text-slate-800">画面表示・文字サイズ設定</h3>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          文字:{' '}
                          {
                            (
                              FONT_SIZE_OPTIONS.find(
                                (f) => f.id === (settingsForm.preferences?.fontSize || getSavedFontSize())
                              ) || FONT_SIZE_OPTIONS[1]
                            ).label
                          }
                          （
                          {
                            (
                              FONT_SIZE_OPTIONS.find(
                                (f) => f.id === (settingsForm.preferences?.fontSize || getSavedFontSize())
                              ) || FONT_SIZE_OPTIONS[1]
                            ).badgeText
                          }
                          ） ／ 配色:{' '}
                          {(
                            THEME_OPTIONS.find(
                              (t) => t.id === (settingsForm.preferences?.colorTheme || getSavedTheme())
                            ) || THEME_OPTIONS[0]
                          ).name.split('（')[0]}
                        </p>
                      </div>
                    </div>
                    <div className="p-1 rounded-md text-slate-400 hover:text-slate-600 bg-white border border-slate-200 shadow-2xs shrink-0">
                      {isAppearanceSettingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>

                  {isAppearanceSettingsOpen && (
                    <div className="p-4 border-t border-slate-200/80 space-y-4 bg-white animate-fade-in">
                      {/* 文字の大きさ（方式A: ルートスケール連動） */}
                      <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="block text-xs font-bold text-slate-700">文字の大きさ（フォントサイズ）</span>
                            <span className="block text-[11px] text-slate-500 mt-0.5">
                              アプリ全体の文字やボタンサイズを見やすく調整します（全画面連動・4段階）
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {FONT_SIZE_OPTIONS.map((opt) => {
                            const curFontSize = settingsForm.preferences?.fontSize || getSavedFontSize();
                            const isSelected = curFontSize === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                  applyFontSize(opt.id);
                                  const updatedPrefs = {
                                    ...(settingsForm.preferences || {}),
                                    fontSize: opt.id,
                                  };
                                  try {
                                    localStorage.setItem(`user_preferences_${user.id}`, JSON.stringify(updatedPrefs));
                                  } catch (_) {}
                                  setSettingsForm({
                                    ...settingsForm,
                                    preferences: updatedPrefs,
                                  });
                                }}
                                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 cursor-pointer ${
                                  isSelected
                                    ? 'border-indigo-500 bg-white shadow-xs ring-2 ring-indigo-500/20'
                                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span
                                    className={`text-xs font-bold ${isSelected ? 'text-indigo-600' : 'text-slate-800'}`}
                                  >
                                    {opt.label}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-400 font-semibold">
                                    {opt.badgeText}
                                  </span>
                                </div>

                                <div className="py-1 flex items-center justify-center bg-slate-50 rounded-lg border border-slate-100">
                                  <span
                                    className={`font-bold transition-all ${
                                      isSelected ? 'text-indigo-700' : 'text-slate-700'
                                    }`}
                                    style={{ fontSize: opt.basePx }}
                                  >
                                    あA
                                  </span>
                                </div>

                                <div className="flex items-center justify-between text-[10px] text-slate-500 leading-tight">
                                  <span>{opt.description.split('（')[0]}</span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 画面配色（カラーテーマ） */}
                      <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="block text-xs font-bold text-slate-700">画面配色・背景色トーン</span>
                            <span className="block text-[11px] text-slate-500 mt-0.5">
                              背景色やくすみアクセントカラーをお好みのトーンに変更できます
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                          {THEME_OPTIONS.map((opt) => {
                            const curTheme = settingsForm.preferences?.colorTheme || getSavedTheme();
                            const isSelected = curTheme === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                  applyColorTheme(opt.id);
                                  const updatedPrefs = {
                                    ...(settingsForm.preferences || {}),
                                    colorTheme: opt.id,
                                  };
                                  try {
                                    localStorage.setItem(`user_preferences_${user.id}`, JSON.stringify(updatedPrefs));
                                  } catch (_) {}
                                  setSettingsForm({
                                    ...settingsForm,
                                    preferences: updatedPrefs,
                                  });
                                }}
                                className={`p-2.5 rounded-xl border text-left transition-all flex items-start gap-2 cursor-pointer ${
                                  isSelected
                                    ? 'border-indigo-500 bg-indigo-50/60 shadow-xs ring-2 ring-indigo-500/20'
                                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
                                }`}
                              >
                                <div
                                  className="w-7 h-7 rounded-md border border-slate-300/80 shadow-2xs shrink-0 flex items-center justify-center relative overflow-hidden mt-0.5 p-0.5"
                                  style={{ backgroundColor: opt.bgPreview }}
                                  title={opt.bgLabel}
                                >
                                  <div
                                    className="w-5 h-3.5 rounded border border-slate-200/90 flex items-center justify-center shadow-2xs"
                                    style={{ backgroundColor: opt.cardPreview }}
                                  >
                                    <div className="flex items-center -space-x-1 scale-65">
                                      {opt.previewColors.map((color, idx) => (
                                        <span
                                          key={idx}
                                          className="w-2 h-2 rounded-full inline-block shadow-2xs ring-1 ring-white/80"
                                          style={{ backgroundColor: color }}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <span
                                      className={`text-[11px] font-bold truncate ${
                                        isSelected ? 'text-indigo-600' : 'text-slate-800'
                                      }`}
                                    >
                                      {opt.name.split('（')[0]}
                                    </span>
                                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                                  </div>
                                  <span className="block text-[9px] text-slate-400 truncate mt-0.5">
                                    {opt.bgLabel}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* ⚙️ マイページ表示件数・環境設定ショートカット */}
                      <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <span className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <Settings className="w-3.5 h-3.5 text-indigo-600" />
                            マイページ表示件数・環境設定
                          </span>
                          <span className="block text-[11px] text-slate-500 mt-0.5">
                            スケジュール、掲示板、伝言メモ、ワークフロー、チャット、日報の表示件数や表示密度をカスタマイズ
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            setIsDisplaySettingsOpen(true);
                          }}
                          className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 text-indigo-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs hover:shadow-xs shrink-0 cursor-pointer"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                          表示件数を設定する
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* メニュー表示設定（ON / OFF・マイページカード連動・アコーディオン開閉） */}
              {(() => {
                const currentMenuVis = getMenuVisibilitySettings(settingsForm);
                const enabledCount = TOGGLEABLE_MENUS.filter((m) => currentMenuVis[m.key]).length;
                const hiddenCount = TOGGLEABLE_MENUS.length - enabledCount;
                const renderMenuIcon = (key: ToggleableMenuKey) => {
                  switch (key) {
                    case 'projects':
                      return <FolderKanban className="w-4 h-4 text-indigo-600 shrink-0" />;
                    case 'daily_report':
                      return <ClipboardList className="w-4 h-4 text-teal-600 shrink-0" />;
                    case 'inspection_report':
                      return <FileCheck2 className="w-4 h-4 text-emerald-600 shrink-0" />;
                    case 'site_management':
                      return <HardHat className="w-4 h-4 text-amber-600 shrink-0" />;
                    case 'assets':
                      return <Boxes className="w-4 h-4 text-sky-600 shrink-0" />;
                  }
                };
                const handleToggleMenuVisibility = (key: ToggleableMenuKey) => {
                  const nextVis = {
                    ...currentMenuVis,
                    [key]: !currentMenuVis[key],
                  };
                  setSettingsForm({
                    ...settingsForm,
                    preferences: {
                      ...(settingsForm.preferences || {}),
                      menuVisibility: nextVis,
                    },
                  });
                };
                const handleResetAllMenusOn = () => {
                  setSettingsForm({
                    ...settingsForm,
                    preferences: {
                      ...(settingsForm.preferences || {}),
                      menuVisibility: { ...DEFAULT_MENU_VISIBILITY },
                    },
                  });
                };

                return (
                  <div className="pt-4 border-t border-slate-100">
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white transition-all">
                      <button
                        type="button"
                        onClick={() => setIsMenuVisibilitySettingsOpen((prev) => !prev)}
                        className="w-full p-3.5 bg-slate-50/80 hover:bg-slate-100/90 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
                            <LayoutGrid className="w-4 h-4 text-emerald-700" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-xs font-bold text-slate-800">メニュー表示設定（ON / OFF）</h3>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                                  hiddenCount > 0
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                }`}
                              >
                                {hiddenCount > 0 ? `${enabledCount}/${TOGGLEABLE_MENUS.length} 表示中` : 'すべて表示'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              プロジェクト・週報・点検報告書・現場管理・資産管理の表示切替（マイページ連動）
                            </p>
                          </div>
                        </div>
                        <div className="p-1 text-slate-400 shrink-0">
                          {isMenuVisibilitySettingsOpen ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </button>

                      {isMenuVisibilitySettingsOpen && (
                        <div className="p-4 border-t border-slate-200/80 space-y-3 bg-white">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="text-[11px] text-slate-500">
                              OFFにした項目は左サイドバーから非表示になり、マイページに対応するカードがある項目も連動して非表示になります。
                            </p>
                            {hiddenCount > 0 && (
                              <button
                                type="button"
                                onClick={handleResetAllMenusOn}
                                className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>すべてONに戻す</span>
                              </button>
                            )}
                          </div>

                          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/40">
                            {TOGGLEABLE_MENUS.map((def) => {
                              const isOn = currentMenuVis[def.key];
                              const displayLabel = getToggleableMenuLabel(def, settingsForm);
                              return (
                                <div
                                  key={def.key}
                                  className="px-3.5 py-3 flex items-center justify-between gap-3 bg-white hover:bg-slate-50/70 transition-colors"
                                >
                                  <div className="flex items-start gap-2.5 min-w-0">
                                    <div className="mt-0.5">{renderMenuIcon(def.key)}</div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-xs font-bold text-slate-800 whitespace-nowrap">
                                          {displayLabel}
                                        </span>
                                        {def.mypageSectionId && (
                                          <span className="px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded whitespace-nowrap">
                                            マイページ連動
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{def.description}</p>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={isOn}
                                    aria-label={`${displayLabel}の表示切替`}
                                    onClick={() => handleToggleMenuVisibility(def.key)}
                                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 focus:outline-none ${
                                      isOn ? 'bg-indigo-600' : 'bg-slate-300'
                                    }`}
                                  >
                                    <span
                                      className={`block w-4 h-4 rounded-full bg-white shadow-xs transform transition-transform absolute top-1 ${
                                        isOn ? 'left-6' : 'left-1'
                                      }`}
                                    />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 🔔 通知センター (メール送信通知設定・トグル開閉) */}
              <div className="pt-4 border-t border-slate-100">
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white transition-all">
                  {/* トグルヘッダー */}
                  <button
                    type="button"
                    onClick={() => setIsNotificationCenterOpen((prev) => !prev)}
                    className="w-full p-3.5 bg-slate-50/80 hover:bg-slate-100/90 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4 text-blue-700" />
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold text-slate-800">
                            通知センター（メール配信 ON/OFF 設定）
                          </h3>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          伝言メモ、掲示板、スケジュール等の更新時のPC・携帯メール通知
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="p-1 rounded-md text-slate-400 hover:text-slate-600 bg-white border border-slate-200 shadow-2xs">
                        {isNotificationCenterOpen ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* 開閉コンテンツ */}
                  {isNotificationCenterOpen && (
                    <div className="p-4 border-t border-slate-200/80 space-y-4 bg-white animate-fade-in text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-100">
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          スケジュール、掲示板、伝言メモ等の更新時に、あなたのPCメール・携帯メール宛へ主要内容と共有リンクを送信するかを設定します。
                        </p>

                        {/* 一括操作ボタン */}
                        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                          <button
                            type="button"
                            onClick={() => handleBatchSetEmailNotif('recommended')}
                            className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[11px] rounded-lg transition-all cursor-pointer shadow-2xs"
                            title="伝言メモ・ワークフロー・点検報告書をON、他をOFFにする推奨設定"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                            <span>推奨</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBatchSetEmailNotif('all_pc_on')}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10.5px] font-medium rounded-lg transition-colors cursor-pointer"
                          >
                            すべてPCオン
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBatchSetEmailNotif('all_mobile_on')}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10.5px] font-medium rounded-lg transition-colors cursor-pointer"
                          >
                            すべて携帯オン
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBatchSetEmailNotif('all_off')}
                            className="px-2 py-1 bg-slate-100 hover:bg-rose-50 text-rose-600 text-[10.5px] font-medium rounded-lg transition-colors cursor-pointer"
                          >
                            すべてオフ
                          </button>
                        </div>
                      </div>

                      {/* メールアドレス接続状況とテスト送信ボタン */}
                      <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11.5px]">
                          <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                            <div className="truncate pr-2">
                              <span className="font-bold text-slate-700">PCメール: </span>
                              {settingsForm.email ? (
                                <span className="font-mono text-slate-900">{settingsForm.email}</span>
                              ) : (
                                <span className="text-amber-600 font-bold">（未登録）</span>
                              )}
                            </div>
                            {settingsForm.email && (
                              <button
                                type="button"
                                disabled={emailTestLoading}
                                onClick={() => handleSendTestEmail(settingsForm.email || '', 'PCメール')}
                                className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                              >
                                テスト送信
                              </button>
                            )}
                          </div>

                          <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                            <div className="truncate pr-2">
                              <span className="font-bold text-slate-700">携帯メール: </span>
                              {settingsForm.mobileEmail ? (
                                <span className="font-mono text-slate-900">{settingsForm.mobileEmail}</span>
                              ) : (
                                <span className="text-amber-600 font-bold">（未登録）</span>
                              )}
                            </div>
                            {settingsForm.mobileEmail && (
                              <button
                                type="button"
                                disabled={emailTestLoading}
                                onClick={() => handleSendTestEmail(settingsForm.mobileEmail || '', '携帯メール')}
                                className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                              >
                                テスト送信
                              </button>
                            )}
                          </div>
                        </div>

                        {emailTestResult && (
                          <div
                            className={`p-2 rounded text-[11px] font-medium flex items-center gap-1.5 ${
                              emailTestResult.type === 'success'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {emailTestResult.type === 'success' ? (
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>{emailTestResult.message}</span>
                          </div>
                        )}
                      </div>

                      {/* メール設定マトリックス */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                        <div className="grid grid-cols-12 bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-700 p-2.5">
                          <div className="col-span-6 sm:col-span-7 pl-1">対象通知機能・項目</div>
                          <div className="col-span-3 sm:col-span-2 text-center">PCメール</div>
                          <div className="col-span-3 sm:col-span-3 text-center">携帯メール</div>
                        </div>

                        <div className="divide-y divide-slate-100 text-xs">
                          {NOTIFICATION_CATEGORIES.map((cat) => {
                            const cur = currentEmailNotifs[cat.key] || { pc: true, mobile: false };
                            return (
                              <div
                                key={cat.key}
                                className="grid grid-cols-12 items-center p-2.5 hover:bg-slate-50/80 transition-colors"
                              >
                                <div className="col-span-6 sm:col-span-7 flex items-start gap-2 pr-2">
                                  {cat.icon}
                                  <div>
                                    <div className="font-bold text-slate-800 text-[12px]">{cat.label}</div>
                                    <div className="text-[10.5px] text-slate-500 leading-tight">{cat.desc}</div>
                                  </div>
                                </div>

                                {/* PCメール トグル */}
                                <div className="col-span-3 sm:col-span-2 flex items-center justify-center">
                                  <label className="inline-flex items-center gap-1 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={cur.pc}
                                      onChange={() => handleToggleEmailNotif(cat.key, 'pc')}
                                      className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 relative"></div>
                                    <span className={`text-[10px] font-bold ${cur.pc ? 'text-blue-600' : 'text-slate-400'}`}>
                                      {cur.pc ? 'ON' : 'OFF'}
                                    </span>
                                  </label>
                                </div>

                                {/* 携帯メール トグル */}
                                <div className="col-span-3 sm:col-span-3 flex items-center justify-center">
                                  <label className="inline-flex items-center gap-1 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={cur.mobile}
                                      onChange={() => handleToggleEmailNotif(cat.key, 'mobile')}
                                      className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600 relative"></div>
                                    <span
                                      className={`text-[10px] font-bold ${cur.mobile ? 'text-purple-600' : 'text-slate-400'}`}
                                    >
                                      {cur.mobile ? 'ON' : 'OFF'}
                                    </span>
                                  </label>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 🚨 安否確認・緊急連絡先（個人メールアドレス暗号化登録・トグル開閉） */}
              <div ref={emergencySectionRef} className="pt-4 border-t border-slate-100">
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white transition-all">
                  {/* アコーディオン・トグルヘッダー */}
                  <button
                    type="button"
                    onClick={() => setIsEmergencyEmailOpen((prev) => !prev)}
                    className="w-full p-3.5 bg-slate-50/80 hover:bg-slate-100/90 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-4 h-4 text-indigo-700" />
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold text-slate-800">
                            安否確認 緊急連絡先（個人メール暗号化設定）
                          </h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            AES-256-GCM
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          災害発生時、社用端末不通に備えて私用メール（Gmail/Yahoo等）へ緊急安否確認メールを配信
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {settingsForm.personalEmailMasked ? (
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold rounded-md flex items-center gap-1 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          登録済: {settingsForm.personalEmailMasked}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold rounded-md">
                          未登録
                        </span>
                      )}
                      <div className="p-1 rounded-md text-slate-400 hover:text-slate-600 bg-white border border-slate-200 shadow-2xs">
                        {isEmergencyEmailOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </button>

                  {/* 開閉コンテンツ */}
                  {isEmergencyEmailOpen && (
                    <div className="p-4 border-t border-slate-200/80 space-y-4 bg-white animate-fade-in text-xs">
                      {/* プライバシー保護・暗号化仕様解説 */}
                      <div className="p-3 bg-indigo-50/70 rounded-xl border border-indigo-100 space-y-1.5">
                        <div className="font-bold text-indigo-950 flex items-center gap-1.5 text-xs">
                          <Lock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          高度な個人情報保護（暗号化）仕様
                        </div>
                        <p className="text-[11px] text-indigo-900 leading-relaxed">
                          入力された個人メールアドレスは <strong>AES-256-GCM</strong> 方式で暗号化して保存されます。
                          データベースや管理画面上でも平文は保存・表示されず、
                          <strong>システム管理者であっても閲覧できません</strong>。
                          安否確認発動時のみ、サーバーがメモリ上で一時復号して緊急配信を行います。
                        </p>
                      </div>

                      {/* 結果・通知アラート */}
                      {personalEmailResult && (
                        <div
                          className={`p-3 rounded-lg flex items-center justify-between text-xs font-bold ${
                            personalEmailResult.type === 'success'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {personalEmailResult.type === 'success' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                            )}
                            <span>{personalEmailResult.message}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPersonalEmailResult(null)}
                            className="text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* 現在の登録状況 & 解除・テスト */}
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <span className="text-[11px] font-bold text-slate-500 block">現在の登録状況:</span>
                            {settingsForm.personalEmailMasked ? (
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs font-extrabold font-mono text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                                  {settingsForm.personalEmailMasked}
                                </span>
                                <span className="text-[10px] text-emerald-600 font-bold">（暗号化保護中）</span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-500 font-medium mt-0.5 block">
                                未登録（災害発動時の個人アドレス宛通知はスキップされます）
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {settingsForm.personalEmailMasked && (
                              <>
                                <button
                                  type="button"
                                  disabled={personalEmailTesting || personalEmailSaving}
                                  onClick={handleTestPersonalEmail}
                                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                                >
                                  {personalEmailTesting ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Mail className="w-3.5 h-3.5" />
                                  )}
                                  <span>テスト送信</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={personalEmailSaving || personalEmailTesting}
                                  onClick={handleRemovePersonalEmail}
                                  className="px-2.5 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>解除</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 個人メールアドレス登録・更新フォーム */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-700">
                          {settingsForm.personalEmailMasked
                            ? '個人メールアドレスの変更'
                            : '個人メールアドレスの新規登録'}
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            ref={personalEmailInputRef}
                            type="email"
                            id="teranago_mypage_personal_email_input"
                            name="teranago_mypage_personal_email_input"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            placeholder="例: private.account@gmail.com / icloud.com 等"
                            value={personalEmailInput}
                            onChange={(e) => setPersonalEmailInput(e.target.value)}
                            className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={personalEmailSaving || !personalEmailInput.trim()}
                              onClick={handleSavePersonalEmail}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50 shrink-0"
                            >
                              {personalEmailSaving ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Lock className="w-3.5 h-3.5" />
                              )}
                              <span>{settingsForm.personalEmailMasked ? '暗号化して更新' : '暗号化して登録'}</span>
                            </button>

                            {personalEmailInput.trim() && (
                              <button
                                type="button"
                                disabled={personalEmailTesting}
                                onClick={handleTestPersonalEmail}
                                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-50"
                              >
                                {personalEmailTesting ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Mail className="w-3.5 h-3.5" />
                                )}
                                <span>入力先へテスト</span>
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          ※登録後は「ya****@gmail.com」のように伏字（マスク）で保護表示されます。
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 📅 外部カレンダー連携（iCal / Google Calendar・トグル開閉） */}
              <div className="pt-4 border-t border-slate-100">
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white transition-all">
                  {/* トグルヘッダー */}
                  <button
                    type="button"
                    onClick={() => setIsICalOpen((prev) => !prev)}
                    className="w-full p-3.5 bg-slate-50/80 hover:bg-slate-100/90 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
                        <CalendarIcon className="w-4 h-4 text-amber-700" />
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold text-slate-800">
                            外部カレンダー同期設定 (iCal / Google Calendar)
                          </h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            iCalendar
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          GoogleカレンダーやiPhone/Outlookとあなたの担当予定を自動同期
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">
                        同期有効
                      </span>
                      <div className="p-1 rounded-md text-slate-400 hover:text-slate-600 bg-white border border-slate-200 shadow-2xs">
                        {isICalOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </button>

                  {/* 開閉コンテンツ */}
                  {isICalOpen && (
                    <div className="p-4 border-t border-slate-200/80 space-y-3 bg-white animate-fade-in text-xs">
                      <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200 space-y-3">
                        <div>
                          <h4 className="text-xs font-bold text-amber-900">iCal形式 外部連携URL（個人専用カレンダー）</h4>
                          <p className="text-[11px] text-amber-700 leading-relaxed mt-0.5">
                            GoogleカレンダーやiPhone・Outlook等にこのURLを登録すると、
                            <strong>ご自身が参加者・担当者として含まれる予定のみ</strong>
                            が自動同期されます（代理投稿した別メンバーの作業等は除外されます）。
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={`${API_BASE_URL}/ical/user_${user.id}_calendar.ics`}
                            className="flex-1 px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-[11px] font-mono text-slate-700 select-all focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`${API_BASE_URL}/ical/user_${user.id}_calendar.ics`);
                              setCopiedICal(true);
                              setTimeout(() => setCopiedICal(false), 2000);
                            }}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            {copiedICal ? 'コピー完了' : 'URLコピー'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 📲 スマートフォン・ブラウザ Web Push プッシュ通知設定（トグル開閉） */}
              <div ref={webPushSectionRef} className="pt-4 border-t border-slate-100">
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white transition-all">
                  {/* トグルヘッダー */}
                  <button
                    type="button"
                    onClick={() => setIsWebPushOpen((prev) => !prev)}
                    className="w-full p-3.5 bg-slate-50/80 hover:bg-slate-100/90 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center shrink-0">
                        <Smartphone className="w-4 h-4 text-indigo-700" />
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold text-slate-800">
                            Web Push プッシュ通知設定（スマホ・PCリアルタイム通知）
                          </h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Web Push
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          電話メモ、チャット、承認依頼などのスマホ・PC端末ロック画面リアルタイム通知
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {pushStatus?.isStagingDisabled ? (
                        <span className="px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold rounded-md">
                          開発環境・停止中
                        </span>
                      ) : pushStatus?.isSubscribed ? (
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold rounded-md flex items-center gap-1 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          受信有効
                        </span>
                      ) : pushStatus?.permission === 'denied' ? (
                        <span className="px-2.5 py-1 bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-bold rounded-md">
                          通知拒否
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold rounded-md">
                          未登録
                        </span>
                      )}
                      <div className="p-1 rounded-md text-slate-400 hover:text-slate-600 bg-white border border-slate-200 shadow-2xs">
                        {isWebPushOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </button>

                  {/* 開閉コンテンツ */}
                  {isWebPushOpen && (
                    <div className="p-4 border-t border-slate-200/80 space-y-3.5 bg-white animate-fade-in text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">
                          この端末でのプッシュ通知受信状態を管理します
                        </span>
                        <button
                          type="button"
                          onClick={refreshPushStatus}
                          className="text-[11px] text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <RefreshCw className={`w-3 h-3 ${pushLoading ? 'animate-spin' : ''}`} />
                          状態更新
                        </button>
                      </div>

                      {pushMessage && (
                        <div
                          className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                            pushMessage.type === 'success'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : pushMessage.type === 'error'
                              ? 'bg-rose-50 text-rose-800 border border-rose-200'
                              : 'bg-sky-50 text-sky-800 border border-sky-200'
                          }`}
                        >
                          {pushMessage.type === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : pushMessage.type === 'error' ? (
                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          ) : (
                            <Info className="w-4 h-4 text-sky-600 shrink-0" />
                          )}
                          <span>{pushMessage.text}</span>
                        </div>
                      )}

                      {pushLoading && pushProgressStep && (
                        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-900 flex items-center gap-2.5 shadow-sm animate-pulse">
                          <Loader2 className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
                          <span>{pushProgressStep}</span>
                        </div>
                      )}

                      {pushStatus?.isStagingDisabled ? (
                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-2 text-amber-900">
                          <div className="flex items-center gap-2 font-bold text-xs">
                            <BellOff className="w-4 h-4 text-amber-700 shrink-0" />
                            <span>開発・評価環境では Web Push 通知を停止しています</span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-amber-800">
                            本番環境との通知重複を防ぐため、旧URL（開発・評価環境）ではプッシュ通知の登録・受信を行いません（残存していた旧購読は自動で解除されます）。プッシュ通知の設定・受信は本番サイト（
                            <code>https://teranago-sns.github.io/po/</code>）からご利用ください。
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 bg-indigo-50/40 rounded-xl border border-indigo-100 space-y-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1.5 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-xs font-bold text-slate-900">この端末でのリアルタイム通知</h4>
                                {pushStatus?.isSubscribed ? (
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    受信有効
                                  </span>
                                ) : pushStatus?.permission === 'denied' ? (
                                  <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded-full">
                                    通知拒否
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded-full">
                                    未登録
                                  </span>
                                )}
                                {pushStatus?.isSubscribed && (
                                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[9.5px] font-semibold rounded-full flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3 text-indigo-600" />
                                    自動修復・維持機能 ON
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-600 leading-relaxed">
                                電話メモ、チャットメッセージ、承認依頼などが届いた際、アプリを開いていなくてもスマートフォンのロック画面やPCに即座に通知されます。
                              </p>
                            </div>
                          </div>

                          {/* 現在アクセス中の端末（この端末）の識別情報 */}
                          {pushStatus?.currentDevice && (
                            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2.5">
                                  {pushStatus.currentDevice.type === 'ios' ||
                                  pushStatus.currentDevice.type === 'android' ? (
                                    <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
                                      <Smartphone className="w-4 h-4" />
                                    </div>
                                  ) : (
                                    <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
                                      <Monitor className="w-4 h-4" />
                                    </div>
                                  )}
                                  <div>
                                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                                      <span>{pushStatus.currentDevice.deviceLabel}</span>
                                      <span className="text-[10px] font-normal text-slate-500">
                                        ({pushStatus.currentDevice.browserLabel})
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                                      <span
                                        className={`px-1.5 py-0.2 rounded font-medium ${
                                          pushStatus.currentDevice.isStandalone
                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                            : 'bg-slate-100 text-slate-600'
                                        }`}
                                      >
                                        {pushStatus.currentDevice.modeLabel}
                                      </span>
                                      <span>•</span>
                                      <span
                                        className={
                                          pushStatus.isSubscribed ? 'text-emerald-600 font-bold' : 'text-slate-500'
                                        }
                                      >
                                        {pushStatus.isSubscribed ? 'この端末: 通知待受中' : 'この端末: 未登録'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {pushStatus.currentDevice.advice && (
                                <p className="text-[10.5px] leading-relaxed text-indigo-900 bg-indigo-50/70 p-2 rounded-lg border border-indigo-100 flex items-start gap-1.5">
                                  <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                                  <span>{pushStatus.currentDevice.advice}</span>
                                </p>
                              )}
                            </div>
                          )}

                          {/* アカウント全体の登録台数情報 */}
                          {pushStatus && (pushStatus.subscriptionCount ?? 0) > 0 && (
                            <div className="p-2.5 bg-indigo-50/60 rounded-lg border border-indigo-100 text-[11px] text-indigo-950 space-y-1">
                              <p className="font-bold flex items-center gap-1 text-[11px]">
                                <span>
                                  📲 あなたのアカウントで現在 <strong>{pushStatus.subscriptionCount}台</strong>{' '}
                                  の端末が通知受信登録されています
                                </span>
                              </p>
                              <p className="text-[10px] text-slate-600 leading-relaxed">
                                ※オフィスのPCやご自身のスマートフォンなど、過去に通知を有効化した端末の合計です。端末側で通知を許可している限り、自動自己修復機能により「未登録」に戻らず自動で受信状態が維持されます。
                              </p>
                            </div>
                          )}

                          {/* アクションボタン群 */}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {pushStatus?.isSubscribed ? (
                              <>
                                <button
                                  type="button"
                                  disabled={pushLoading}
                                  onClick={handleTestPush}
                                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                  {pushLoading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Send className="w-3.5 h-3.5" />
                                  )}
                                  テスト通知を送信
                                </button>
                                <button
                                  type="button"
                                  disabled={pushLoading}
                                  onClick={handleDisablePush}
                                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                  <BellOff className="w-3.5 h-3.5 text-slate-400" />
                                  この端末の通知を解除
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={pushLoading}
                                onClick={handleEnablePush}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                {pushLoading ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <BellRing className="w-4 h-4" />
                                )}
                                この端末でプッシュ通知を有効にする
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={pushLoading || diagLoading}
                              onClick={handleRunDiagnostics}
                              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                            >
                              {diagLoading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                              ) : (
                                <Wrench className="w-3.5 h-3.5 text-slate-500" />
                              )}
                              端末通知環境を診断
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* フッターアクション */}
              <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  {onLogout && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onLogout();
                      }}
                      className="px-3.5 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>ログアウト</span>
                    </button>
                  )}

                  {impersonatorAdmin && onRevertToAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onRevertToAdmin();
                      }}
                      className="px-3.5 py-2 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                      title="元の管理者アカウントにワンクリックで復帰します"
                    >
                      <Undo2 className="w-4 h-4 text-amber-700" />
                      <span>管理者（{impersonatorAdmin.name}）に戻る</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm cursor-pointer"
                  >
                    設定内容を保存
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 端末通知環境診断モーダル */}
      {diagModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">端末通知環境の自己診断レポート</h3>
              </div>
              <button
                type="button"
                onClick={() => setDiagModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {diagLoading ? (
              <div className="py-12 text-center space-y-3">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
                <p className="text-xs text-slate-500 font-medium">
                  ブラウザ環境・Service Worker・サーバー通信をチェック中...
                </p>
              </div>
            ) : diagReport ? (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 block font-medium">通信プロトコル (HTTPS)</span>
                    <span
                      className={`font-bold flex items-center gap-1 mt-0.5 ${
                        diagReport.isHttps ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {diagReport.isHttps ? '✅ 正常 (HTTPS / Localhost)' : '❌ 非安全 (HTTP)'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 block font-medium">表示ウィンドウ環境</span>
                    <span
                      className={`font-bold flex items-center gap-1 mt-0.5 ${
                        diagReport.isTopWindow ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    >
                      {diagReport.isTopWindow ? '✅ トップレベル画面' : '⚠️ iFrame内（注意）'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 block font-medium">Push / Notification API</span>
                    <span
                      className={`font-bold flex items-center gap-1 mt-0.5 ${
                        diagReport.hasNotification && diagReport.hasPushManager ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {diagReport.hasNotification && diagReport.hasPushManager
                        ? '✅ サポート対応'
                        : '❌ 非対応ブラウザ'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 block font-medium">通知パーミッション</span>
                    <span
                      className={`font-bold flex items-center gap-1 mt-0.5 ${
                        diagReport.permission === 'granted'
                          ? 'text-emerald-600'
                          : diagReport.permission === 'denied'
                          ? 'text-rose-600'
                          : 'text-slate-600'
                      }`}
                    >
                      {diagReport.permission === 'granted'
                        ? '✅ 許可済み (granted)'
                        : diagReport.permission === 'denied'
                        ? '❌ 拒否済み (denied)'
                        : '⚪️ 未設定 (default)'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 block font-medium">Service Worker (/sw.js)</span>
                    <span
                      className={`font-bold flex items-center gap-1 mt-0.5 ${
                        diagReport.swActive ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {diagReport.swActive ? '✅ 稼働可能' : '❌ 起動不能/エラー'}
                    </span>
                    {diagReport.swErrorDetails && (
                      <span
                        className="text-[9px] text-rose-500 block truncate mt-0.5 font-mono"
                        title={diagReport.swErrorDetails}
                      >
                        {diagReport.swErrorDetails}
                      </span>
                    )}
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 block font-medium">VAPID公開鍵API</span>
                    <span
                      className={`font-bold flex items-center gap-1 mt-0.5 ${
                        diagReport.vapidApiOk ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {diagReport.vapidApiOk ? '✅ 応答正常' : '❌ 通信失敗'}
                    </span>
                  </div>
                </div>

                {diagReport.recommendations.length > 0 ? (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                    <h4 className="font-bold text-amber-900 text-xs flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      検出された問題と改善の解決手順
                    </h4>
                    <ul className="space-y-1.5 pl-1 text-[11px] text-amber-800 leading-relaxed list-disc list-inside">
                      {diagReport.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    お使いの端末・ブラウザ環境は正常にプッシュ通知をサポートしています！
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setDiagModalOpen(false)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* マイページ表示件数・環境設定モーダル（個人設定内のショートカットから起動時） */}
      <MyPageDisplaySettingsModal
        isOpen={isDisplaySettingsOpen}
        onClose={() => setIsDisplaySettingsOpen(false)}
        currentCounts={sectionCounts}
        currentEnvSettings={envSettings}
        targetSectionId={null}
        hiddenSectionIds={getHiddenMyPageSectionIdsByMenu(user)}
        onSave={handleSaveDisplaySettings}
      />

      <ConfirmModal
        {...confirmModal}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </>
  );
}
