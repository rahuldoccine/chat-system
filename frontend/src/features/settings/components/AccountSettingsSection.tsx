import React from 'react';
import { Loader2, LogOut, ShieldAlert } from 'lucide-react';
import type { UseFormHandleSubmit, UseFormRegister, FieldErrors } from 'react-hook-form';
import ProfileAvatarUpload from './ProfileAvatarUpload';
import ChangePasswordForm from './ChangePasswordForm';
import type { ProfileFormValues } from '../types/settingsForm';
import type { Profile } from '../hooks/useUserSettings';
import styles from '../../../pages/SettingsPage.module.css';

type AccountSettingsSectionProps = {
  profileLoading: boolean;
  profile: Profile | undefined;
  savingProfile: boolean;
  formError: string | null;
  busy: 'logout' | 'logoutAll' | null;
  register: UseFormRegister<ProfileFormValues>;
  errors: FieldErrors<ProfileFormValues>;
  handleSubmit: UseFormHandleSubmit<ProfileFormValues>;
  onSaveProfile: (values: ProfileFormValues) => Promise<void>;
  onProfileUpdated: (user: Profile) => void;
  onLogout: () => void;
  onLogoutAll: () => void;
};

const AccountSettingsSection: React.FC<AccountSettingsSectionProps> = ({
  profileLoading,
  profile,
  savingProfile,
  formError,
  busy,
  register,
  errors,
  handleSubmit,
  onSaveProfile,
  onProfileUpdated,
  onLogout,
  onLogoutAll,
}) => (
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
              onUpdated={onProfileUpdated}
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
            {errors.username && <p className={styles.errorText}>{errors.username.message}</p>}
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
      <h3 className={styles.cardTitle}>Password</h3>
      <p className={styles.mainDescription} style={{ marginTop: 0 }}>
        Use a strong password you do not reuse on other sites.
      </p>
      <ChangePasswordForm />
    </section>

    <section className={styles.card}>
      <h3 className={styles.cardTitle}>Sessions</h3>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btn}
          disabled={busy !== null}
          onClick={onLogout}
        >
          {busy === 'logout' ? <Loader2 size={18} /> : <LogOut size={18} />}
          Sign out
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnDanger}`}
          disabled={busy !== null}
          onClick={onLogoutAll}
        >
          <ShieldAlert size={18} />
          Sign out everywhere
        </button>
      </div>
    </section>
  </>
);

export default AccountSettingsSection;
