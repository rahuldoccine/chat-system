import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, LogOut, ShieldAlert, Loader2, User, Shield } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../features/chat/components/ConfirmModal';
import {
  useProfile,
  useUpdateProfile,
  useAppSettings,
  useUpdateAppSettings,
  getApiErrorMessage,
} from '../features/settings/hooks/useUserSettings';
import ProfileAvatarUpload from '../features/settings/components/ProfileAvatarUpload';
import AdminReportsPanel from '../features/settings/components/AdminReportsPanel';
import E2eeRecoveryPanel from '../features/settings/components/E2eeRecoveryPanel';
import { useProfileSync } from '../features/settings/hooks/useProfileSync';
import {
  BROWSER_NOTIFICATION_BLOCKED_HINT,
  getBrowserNotificationPermission,
  isWebPushSupported,
  registerWebPush,
  requestBrowserNotificationPermission,
  unregisterWebPush,
} from '../services/push';
import styles from './SettingsPage.module.css';

type SettingsSection = 'account' | 'privacy' | 'reports';

const BASE_NAV_ITEMS: { id: SettingsSection; label: string; icon: typeof User }[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'privacy', label: 'Privacy', icon: Shield },
];

const ADMIN_NAV_ITEM = { id: 'reports' as const, label: 'Reports', icon: ShieldAlert };

const profileSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(120),
  username: z
    .string()
    .max(32)
    .regex(/^[a-zA-Z0-9_]*$/, 'Letters, numbers, and underscores only')
    .optional()
    .or(z.literal('')),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { logout, logoutAll } = useAuth();
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
    const requested = searchParams.get('section');
    if (requested === 'reports') {
      if (isAdmin) {
        setSection('reports');
      } else {
        setSection('account');
      }
    }
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
        toast.error('message' in result ? result.message : "We couldn't turn on notifications. Please try again.");
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
      <Toaster position="top-center" richColors />

      <aside className={styles.sidebar}>
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

        <nav className={styles.nav} aria-label="Settings sections">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`${styles.navItem} ${section === id ? styles.navItemActive : ''}`}
              aria-current={section === id ? 'page' : undefined}
              onClick={() => setSection(id)}
            >
              <Icon size={18} className={styles.navIcon} />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main className={styles.main}>
        {section === 'account' && (
          <>
            <header className={styles.mainHeader}>
              <h2 className={styles.mainTitle}>Account</h2>
              <p className={styles.mainDescription}>Manage your profile and active sessions</p>
            </header>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Profile</h3>
              {profileLoading ? (
                <div className={styles.loading}>
                  <Loader2 size={22} className={styles.spinner} />
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSaveProfile)}>
                  {profile && (
                    <ProfileAvatarUpload
                      profile={profile}
                      disabled={savingProfile}
                      onUpdated={(user) => syncProfileEverywhere(user)}
                    />
                  )}
                  {formError && <p className={styles.formError}>{formError}</p>}
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="displayName">
                      Display name
                    </label>
                    <input
                      id="displayName"
                      className={`${styles.input} ${errors.displayName ? styles.inputError : ''}`}
                      {...register('displayName')}
                    />
                    {errors.displayName && (
                      <p className={styles.errorText}>{errors.displayName.message}</p>
                    )}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="username">
                      Username
                    </label>
                    <input
                      id="username"
                      className={`${styles.input} ${errors.username ? styles.inputError : ''}`}
                      placeholder="optional"
                      {...register('username')}
                    />
                    {errors.username && (
                      <p className={styles.errorText}>{errors.username.message}</p>
                    )}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="email">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      className={`${styles.input} ${styles.inputDisabled}`}
                      value={profile?.email ?? ''}
                      disabled
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                  <div className={styles.formActions}>
                    <button
                      type="submit"
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      disabled={savingProfile}
                    >
                      {savingProfile ? <Loader2 size={18} /> : null}
                      Save profile
                    </button>
                  </div>
                </form>
              )}
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Sessions</h3>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.btn}
                  disabled={busy !== null}
                  onClick={() => void handleLogout()}
                >
                  {busy === 'logout' ? <Loader2 size={18} /> : <LogOut size={18} />}
                  Sign out
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnDanger}`}
                  disabled={busy !== null}
                  onClick={() => setShowLogoutAllConfirm(true)}
                >
                  <ShieldAlert size={18} />
                  Sign out everywhere
                </button>
              </div>
            </section>
          </>
        )}

        {section === 'privacy' && (
          <>
            <header className={styles.mainHeader}>
              <h2 className={styles.mainTitle}>Privacy</h2>
              <p className={styles.mainDescription}>
                Control notifications and read receipt visibility
              </p>
            </header>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Notifications & privacy</h3>
              {settingsLoading || !appSettings ? (
                <div className={styles.loading}>
                  <Loader2 size={22} className={styles.spinner} />
                </div>
              ) : (
                <>
                  <div className={styles.toggleRow}>
                    <div>
                      <div className={styles.toggleLabel}>Push notifications</div>
                      <div className={styles.toggleHint}>Alerts when you are offline</div>
                    </div>
                    <label className={styles.toggle}>
                      <input
                        type="checkbox"
                        checked={appSettings.notifyPush}
                        disabled={savingSettings}
                        onChange={(e) => void onTogglePush(e.target.checked)}
                      />
                      <span className={styles.toggleSlider} />
                    </label>
                  </div>
                  {isWebPushSupported() && browserNotificationPermission !== 'granted' && (
                    <div className={styles.permissionBanner}>
                      <p className={styles.permissionBannerText}>
                        {browserNotificationPermission === 'denied'
                          ? 'Browser notifications are blocked for this site.'
                          : 'Allow browser notifications to receive alerts on this device.'}
                      </p>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnPrimary} ${styles.permissionBannerBtn}`}
                        disabled={requestingNotificationPermission || savingSettings}
                        onClick={() => void handleRequestBrowserNotificationPermission()}
                      >
                        {requestingNotificationPermission ? (
                          <Loader2 size={16} className={styles.spinner} />
                        ) : null}
                        {browserNotificationPermission === 'denied'
                          ? 'How to enable notifications'
                          : 'Allow browser notifications'}
                      </button>
                      {browserNotificationPermission === 'denied' && (
                        <p className={styles.permissionBannerHint}>
                          Click the lock or site icon in the address bar → Notifications → Allow, then reload
                          this page.
                        </p>
                      )}
                    </div>
                  )}
                  <div className={styles.toggleRow}>
                    <div>
                      <div className={styles.toggleLabel}>Email notifications</div>
                      <div className={styles.toggleHint}>Updates sent to your email</div>
                    </div>
                    <label className={styles.toggle}>
                      <input
                        type="checkbox"
                        checked={appSettings.notifyEmail}
                        disabled={savingSettings}
                        onChange={(e) => void onToggleSetting('notifyEmail', e.target.checked)}
                      />
                      <span className={styles.toggleSlider} />
                    </label>
                  </div>
                  <div className={styles.toggleRow}>
                    <div>
                      <div className={styles.toggleLabel}>Read receipts</div>
                      <div className={styles.toggleHint}>Let others see when you read messages</div>
                    </div>
                    <label className={styles.toggle}>
                      <input
                        type="checkbox"
                        checked={appSettings.showReadReceipts}
                        disabled={savingSettings}
                        onChange={(e) =>
                          void onToggleSetting('showReadReceipts', e.target.checked)
                        }
                      />
                      <span className={styles.toggleSlider} />
                    </label>
                  </div>
                </>
              )}
            </section>

            <section className={styles.card}>
              <E2eeRecoveryPanel />
            </section>
          </>
        )}

        {section === 'reports' && isAdmin && (
          <>
            <header className={styles.mainHeader}>
              <h2 className={styles.mainTitle}>Reports</h2>
              <p className={styles.mainDescription}>
                Review user reports submitted from direct messages
              </p>
            </header>
            <section className={styles.card}>
              <AdminReportsPanel />
            </section>
          </>
        )}
      </main>

      <ConfirmModal
        open={showLogoutAllConfirm}
        title="Sign out on all devices?"
        description="This will end your session on every browser and device where you are signed in to Chat System. You will need to sign in again on each one."
        confirmLabel="Sign out everywhere"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={busy === 'logoutAll'}
        onConfirm={() => void handleLogoutAllConfirm()}
        onCancel={() => {
          if (busy !== 'logoutAll') setShowLogoutAllConfirm(false);
        }}
      />
    </div>
  );
};

export default SettingsPage;
