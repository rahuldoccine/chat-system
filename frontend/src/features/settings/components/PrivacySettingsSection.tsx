import React from 'react';
import { Loader2 } from 'lucide-react';
import { isWebPushSupported } from '../../../services/push';
import styles from '../../../pages/SettingsPage.module.css';
import { handlerEvent } from '../../../utils/asyncHandler';

type AppSettings = {
  notifyPush: boolean;
  notifyEmail: boolean;
  showReadReceipts: boolean;
};

type PrivacySettingsSectionProps = {
  settingsLoading: boolean;
  appSettings: AppSettings | undefined;
  savingSettings: boolean;
  browserNotificationPermission: NotificationPermission | 'unsupported';
  requestingNotificationPermission: boolean;
  onTogglePush: (enabled: boolean) => void;
  onToggleSetting: (key: 'notifyEmail' | 'showReadReceipts', value: boolean) => void;
  onRequestBrowserNotificationPermission: () => void;
};

function browserNotificationBannerText(
  permission: NotificationPermission | 'unsupported',
): string {
  if (permission === 'denied') return 'Browser notifications are blocked for this site.';
  return 'Allow browser notifications to receive alerts on this device.';
}

function browserNotificationButtonLabel(
  permission: NotificationPermission | 'unsupported',
): string {
  if (permission === 'denied') return 'How to enable notifications';
  return 'Allow browser notifications';
}

const PrivacySettingsSection: React.FC<PrivacySettingsSectionProps> = ({
  settingsLoading,
  appSettings,
  savingSettings,
  browserNotificationPermission,
  requestingNotificationPermission,
  onTogglePush,
  onToggleSetting,
  onRequestBrowserNotificationPermission,
}) => (
  <>
    <header className={styles.mainHeader}>
      <h2 className={styles.mainTitle}>Privacy</h2>
      <p className={styles.mainDescription}>Control notifications and read receipt visibility</p>
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
            <label className={styles.toggle} htmlFor="settings-notify-push">
              <input
                id="settings-notify-push"
                type="checkbox"
                aria-label="Push notifications"
                disabled={savingSettings}
                onChange={handlerEvent((e) => onTogglePush(e.target.checked))}
              />
              <span className={styles.toggleSlider} />
            </label>
          </div>
          {isWebPushSupported() && browserNotificationPermission !== 'granted' && (
            <div className={styles.permissionBanner}>
              <p className={styles.permissionBannerText}>
                {browserNotificationBannerText(browserNotificationPermission)}
              </p>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary} ${styles.permissionBannerBtn}`}
                disabled={requestingNotificationPermission || savingSettings}
                onClick={onRequestBrowserNotificationPermission}
              >
                {requestingNotificationPermission ? (
                  <Loader2 size={16} className={styles.spinner} />
                ) : null}
                {browserNotificationButtonLabel(browserNotificationPermission)}
              </button>
              {browserNotificationPermission === 'denied' && (
                <p className={styles.permissionBannerHint}>
                  Click the lock or site icon in the address bar → Notifications → Allow, then
                  reload this page.
                </p>
              )}
            </div>
          )}
          <div className={styles.toggleRow}>
            <div>
              <div className={styles.toggleLabel}>Email notifications</div>
              <div className={styles.toggleHint}>Updates sent to your email</div>
            </div>
            <label className={styles.toggle} htmlFor="settings-notify-email">
              <input
                id="settings-notify-email"
                type="checkbox"
                aria-label="Email notifications"
                disabled={savingSettings}
                onChange={handlerEvent((e) => onToggleSetting('notifyEmail', e.target.checked))}
              />
              <span className={styles.toggleSlider} />
            </label>
          </div>
          <div className={styles.toggleRow}>
            <div>
              <div className={styles.toggleLabel}>Read receipts</div>
              <div className={styles.toggleHint}>Let others see when you read messages</div>
            </div>
            <label className={styles.toggle} htmlFor="settings-read-receipts">
              <input
                id="settings-read-receipts"
                type="checkbox"
                aria-label="Read receipts"
                disabled={savingSettings}
                onChange={handlerEvent((e) => onToggleSetting('showReadReceipts', e.target.checked))}
              />
              <span className={styles.toggleSlider} />
            </label>
          </div>
        </>
      )}
    </section>
  </>
);

export default PrivacySettingsSection;
