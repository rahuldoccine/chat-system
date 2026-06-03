import React, { useEffect, useMemo, useState } from 'react';
import { handler, handlerArg, runHandler } from '../utils/asyncHandler';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, ShieldAlert, User, Shield, Palette } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../features/chat/components/ConfirmModal';
import {
  useProfile,
  useUpdateProfile,
  useAppSettings,
  useUpdateAppSettings,
  getApiErrorMessage,
} from '../features/settings/hooks/useUserSettings';
import { useProfileSync } from '../features/settings/hooks/useProfileSync';
import AccountSettingsSection from '../features/settings/components/AccountSettingsSection';
import AppearanceSettingsSection from '../features/settings/components/AppearanceSettingsSection';
import PrivacySettingsSection from '../features/settings/components/PrivacySettingsSection';
import ReportsSettingsSection from '../features/settings/components/ReportsSettingsSection';
import type { ProfileFormValues } from '../features/settings/types/settingsForm';
import {
  BROWSER_NOTIFICATION_BLOCKED_HINT,
  getBrowserNotificationPermission,
  isWebPushSupported,
  registerWebPush,
  requestBrowserNotificationPermission,
  unregisterWebPush,
} from '../services/push';
import styles from './SettingsPage.module.css';
import subNavStyles from '../features/chat/components/ChatSubNav.module.css';
import ChatSystemLogo from '../components/brand/ChatSystemLogo';
import { useIsMobile } from '../hooks/useBreakpoint';

type SettingsSection = 'account' | 'appearance' | 'privacy' | 'reports';

const BASE_NAV_ITEMS: { id: SettingsSection; label: string; icon: typeof User }[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'privacy', label: 'Privacy', icon: Shield },
];

const ADMIN_NAV_ITEM = { id: 'reports' as const, label: 'Reports', icon: ShieldAlert };

const profileSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(120),
  username: z
    .string()
    .max(32)
    .regex(/^\w*$/, 'Letters, numbers, and underscores only')
    .optional()
    .or(z.literal('')),
});

function resolveSectionFromSearchParam(
  requested: string | null,
  isAdmin: boolean,
): SettingsSection | null {
  if (requested === 'appearance' || requested === 'privacy' || requested === 'account') {
    return requested;
  }
  if (requested === 'reports') {
    return isAdmin ? 'reports' : 'account';
  }
  return null;
}

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { logout, logoutAll } = useAuth();
  const isMobile = useIsMobile();
  const { preference: themePreference, resolved: resolvedTheme, setPreference: setThemePreference } =
    useTheme();
  const { syncProfileEverywhere } = useProfileSync();
  const [section, setSection] = useState<SettingsSection>('account');
  const [busy, setBusy] = useState<'logout' | 'logoutAll' | null>(null);
  const [showLogoutAllConfirm, setShowLogoutAllConfirm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => getBrowserNotificationPermission());
  const [requestingNotificationPermission, setRequestingNotificationPermission] = useState(false);

  const { data: profile, isLoading: profileLoading } = useProfile();
  const isAdmin = Boolean(profile?.isAdmin);
  const navItems = useMemo(
    () => (isAdmin ? [...BASE_NAV_ITEMS, ADMIN_NAV_ITEM] : BASE_NAV_ITEMS),
    [isAdmin],
  );
  const { mutateAsync: updateProfile, isPending: savingProfile } = useUpdateProfile();
  const { data: appSettings, isLoading: settingsLoading } = useAppSettings();
  const { mutateAsync: updateAppSettings, isPending: savingSettings } = useUpdateAppSettings();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: '', username: '' },
  });

  useEffect(() => {
    if (profile) {
      reset({
        displayName: profile.displayName || '',
        username: profile.username || '',
      });
    }
  }, [profile, reset]);

  useEffect(() => {
    const nextSection = resolveSectionFromSearchParam(searchParams.get('section'), isAdmin);
    if (nextSection) setSection(nextSection);
  }, [searchParams, isAdmin]);

  useEffect(() => {
    if (section === 'reports' && !isAdmin && !profileLoading) {
      setSection('account');
    }
  }, [section, isAdmin, profileLoading]);

  useEffect(() => {
    if (section !== 'privacy') return;
    setBrowserNotificationPermission(getBrowserNotificationPermission());

    const refresh = () => setBrowserNotificationPermission(getBrowserNotificationPermission());
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [section]);

  const handleRequestBrowserNotificationPermission = async () => {
    if (!isWebPushSupported()) {
      toast.error('Notifications are not available in this browser');
      return;
    }

    setRequestingNotificationPermission(true);
    try {
      const before = Notification.permission;
      const result = await requestBrowserNotificationPermission();
      setBrowserNotificationPermission(getBrowserNotificationPermission());

      if (result.granted) {
        toast.success('Browser notifications allowed');
        if (appSettings?.notifyPush) {
          const reg = await registerWebPush();
          if (!reg.ok && 'message' in reg) {
            toast.error(reg.message);
          }
        }
        return;
      }

      if (result.blocked || (before === 'denied' && result.permission === 'denied')) {
        toast.error(BROWSER_NOTIFICATION_BLOCKED_HINT, { duration: 8000 });
        return;
      }

      toast.error('Please allow notifications when your browser asks');
    } finally {
      setRequestingNotificationPermission(false);
    }
  };

  const onSaveProfile = async (values: ProfileFormValues) => {
    if (!profile) return;
    setFormError(null);
    const optimistic = {
      ...profile,
      displayName: values.displayName.trim(),
      username: values.username?.trim() ? values.username.trim() : null,
    };
    syncProfileEverywhere(optimistic);
    try {
      await updateProfile({
        displayName: optimistic.displayName,
        username: optimistic.username,
      });
      toast.success('Profile updated');
    } catch (err) {
      const message = getApiErrorMessage(err, "We couldn't save your profile. Please try again.");
      setFormError(message);
      toast.error(message);
    }
  };

  const onToggleSetting = async (
    key: 'notifyEmail' | 'showReadReceipts',
    value: boolean,
  ) => {
    if (!appSettings) return;
    try {
      await updateAppSettings({ [key]: value });
      toast.success('Preference saved');
    } catch (err) {
      toast.error(getApiErrorMessage(err, "We couldn't save your setting. Please try again."));
    }
  };

  const onTogglePush = async (enabled: boolean) => {
    if (!appSettings) return;

    if (enabled) {
      if (getBrowserNotificationPermission() !== 'granted') {
        await handleRequestBrowserNotificationPermission();
        if (getBrowserNotificationPermission() !== 'granted') {
          return;
        }
      }
      const result = await registerWebPush();
      if (!result.ok) {
        toast.error(
          'message' in result ? result.message : "We couldn't turn on notifications. Please try again.",
        );
        return;
      }
      try {
        await updateAppSettings({ notifyPush: true });
        toast.success('Push notifications enabled');
      } catch (err) {
        await unregisterWebPush();
        toast.error(getApiErrorMessage(err, "We couldn't save your setting. Please try again."));
      }
      return;
    }

    try {
      await updateAppSettings({ notifyPush: false });
      await unregisterWebPush();
      toast.success('Push notifications disabled');
    } catch (err) {
      toast.error(getApiErrorMessage(err, "We couldn't save your setting. Please try again."));
    }
  };

  const handleLogout = async () => {
    setBusy('logout');
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setBusy(null);
    }
  };

  const handleLogoutAllConfirm = async () => {
    setBusy('logoutAll');
    try {
      await logoutAll();
      setShowLogoutAllConfirm(false);
      navigate('/login', { replace: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.page}>

      <aside className={styles.sidebar}>
        <ChatSystemLogo
          variant="full"
          size="sm"
          theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
          showSubtitle={false}
          className={styles.sidebarBrand}
        />

        <button type="button" className={styles.backLink} onClick={() => navigate('/')}>
          <ArrowLeft size={16} />
          Back to chat
        </button>

        <div className={styles.sidebarHeader}>
          <h1 className={styles.title}>Settings</h1>
          <p className={styles.subtitle}>
            {isAdmin
              ? 'Account, privacy, reports, and sessions'
              : 'Account, privacy, and sessions'}
          </p>
        </div>

        {!isMobile && (
          <nav className={styles.nav} aria-label="Settings sections">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`${styles.navItem} ${section === id ? styles.navItemActive : ''}`}
                aria-current={section === id ? 'page' : undefined}
                onClick={() => setSection(id)}
              >
                <Icon size={18} className={styles.navIcon} aria-hidden />
                <span className={styles.navLabel}>{label}</span>
              </button>
            ))}
          </nav>
        )}
      </aside>

      {isMobile && (
        <nav className={subNavStyles.nav} aria-label="Settings sections">
          {navItems.map(({ id, label, icon: Icon }) => {
            const isActive = section === id;
            return (
              <button
                key={id}
                type="button"
                className={`${subNavStyles.tab} ${isActive ? subNavStyles.tabActive : ''}`}
                aria-selected={isActive}
                role="tab"
                onClick={() => setSection(id)}
              >
                <span className={subNavStyles.tabIcon}>
                  <Icon size={16} strokeWidth={2} aria-hidden />
                </span>
                <span className={subNavStyles.tabLabel}>{label}</span>
              </button>
            );
          })}
        </nav>
      )}

      <main className={styles.main}>
        {section === 'account' && (
          <AccountSettingsSection
            profileLoading={profileLoading}
            profile={profile}
            savingProfile={savingProfile}
            formError={formError}
            busy={busy}
            register={register}
            errors={errors}
            handleSubmit={handleSubmit}
            onSaveProfile={onSaveProfile}
            onProfileUpdated={(user) => syncProfileEverywhere(user)}
            onLogout={handler(handleLogout)}
            onLogoutAll={() => setShowLogoutAllConfirm(true)}
          />
        )}

        {section === 'appearance' && (
          <AppearanceSettingsSection
            themePreference={themePreference}
            onThemeChange={setThemePreference}
          />
        )}

        {section === 'privacy' && (
          <PrivacySettingsSection
            settingsLoading={settingsLoading}
            appSettings={appSettings}
            savingSettings={savingSettings}
            browserNotificationPermission={browserNotificationPermission}
            requestingNotificationPermission={requestingNotificationPermission}
            onTogglePush={handlerArg(onTogglePush)}
            onToggleSetting={(key, value) => runHandler(() => onToggleSetting(key, value))}
            onRequestBrowserNotificationPermission={handler(
              handleRequestBrowserNotificationPermission,
            )}
          />
        )}

        {section === 'reports' && isAdmin && <ReportsSettingsSection />}
      </main>

      <ConfirmModal
        open={showLogoutAllConfirm}
        title="Sign out on all devices?"
        description="This will end your session on every browser and device where you are signed in to Chat System. You will need to sign in again on each one."
        confirmLabel="Sign out everywhere"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={busy === 'logoutAll'}
        onConfirm={handler(handleLogoutAllConfirm)}
        onCancel={() => {
          if (busy !== 'logoutAll') setShowLogoutAllConfirm(false);
        }}
      />
    </div>
  );
};

export default SettingsPage;
