import React, { useEffect, useState } from 'react';
import { Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import * as e2eeRecovery from '../../e2ee/recovery';
import { ensureE2eeReady } from '../../e2ee/bootstrap';
import styles from './E2eeRecoveryPanel.module.css';

const E2eeRecoveryPanel: React.FC = () => {
  const { user, markE2eeUnlocked } = useAuth();
  const [passphrase, setPassphrase] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [code, setCode] = useState('');
  const [stepUpToken, setStepUpToken] = useState<string | null>(null);
  const [restorePass, setRestorePass] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<e2eeRecovery.AccountKeyStatus | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    void e2eeRecovery.getServerAccountKeyStatus().then(setBackupStatus).catch(() => {
      setBackupStatus(null);
    });
  }, [user?.id]);

  const handleCreateBackup = async () => {
    if (!user?.id) return;
    if (passphrase.length < 8) {
      toast.error('Use a recovery passphrase of at least 8 characters');
      return;
    }
    if (passphrase !== confirmPass) {
      toast.error('Passphrases do not match');
      return;
    }
    setBusy('backup');
    try {
      await e2eeRecovery.createAndUploadBackup(user.id, passphrase);
      toast.success('Encryption backup saved');
      setPassphrase('');
      setConfirmPass('');
      const status = await e2eeRecovery.getServerAccountKeyStatus();
      setBackupStatus(status);
    } catch {
      toast.error('Could not save backup');
    } finally {
      setBusy(null);
    }
  };

  const handleRequestCode = async () => {
    setBusy('challenge');
    try {
      await e2eeRecovery.requestRecoveryCode();
      toast.success('Recovery code sent to your email');
    } catch {
      toast.error('Could not send recovery code. Verify your email first.');
    } finally {
      setBusy(null);
    }
  };

  const handleVerifyCode = async () => {
    setBusy('verify');
    try {
      const token = await e2eeRecovery.verifyRecoveryCode(code.trim());
      setStepUpToken(token);
      toast.success('Verified — enter your recovery passphrase to restore keys');
    } catch {
      toast.error('Invalid or expired code');
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    if (!user?.id || !stepUpToken) return;
    setBusy('restore');
    try {
      await e2eeRecovery.restoreFromBackup(user.id, restorePass, stepUpToken);
      await ensureE2eeReady(user.id);
      markE2eeUnlocked();
      toast.success('Encryption keys restored on this device');
      setCode('');
      setStepUpToken(null);
      setRestorePass('');
    } catch {
      toast.error('Restore failed — check passphrase and try again');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <Shield size={18} aria-hidden />
        <h3>Account recovery</h3>
      </div>
      <p className={styles.hint}>
        Direct messages are end-to-end encrypted. Your keys are backed up to your account (wrapped
        with your sign-in password) on each login and when you change your password in Settings.
        If you used &quot;Forgot password&quot; by email, restore keys here with your recovery
        passphrase or sign-in password after email verification.
      </p>

      {backupStatus ? (
        <p className={styles.statusLine}>
          {backupStatus.hasBackup ? (
            <>
              Keys protected
              {backupStatus.backupUpdatedAt
                ? ` · backup updated ${new Date(backupStatus.backupUpdatedAt).toLocaleString()}`
                : ''}
            </>
          ) : backupStatus.hasIdentityKey ? (
            <>Encryption active but no password backup yet — sign in with password to create one.</>
          ) : (
            <>No encryption keys registered on this account yet.</>
          )}
        </p>
      ) : null}

      <div className={styles.block}>
        <h4>Create backup</h4>
        <label className={styles.label}>
          Recovery passphrase
          <input
            type="password"
            className={styles.input}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label className={styles.label}>
          Confirm passphrase
          <input
            type="password"
            className={styles.input}
            value={confirmPass}
            onChange={(e) => setConfirmPass(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={busy === 'backup'}
          onClick={() => void handleCreateBackup()}
        >
          {busy === 'backup' ? <Loader2 size={16} className={styles.spin} /> : null}
          Save backup
        </button>
      </div>

      <div className={styles.block}>
        <h4>Restore on this device</h4>
        <button
          type="button"
          className={styles.secondaryBtn}
          disabled={busy === 'challenge'}
          onClick={() => void handleRequestCode()}
        >
          {busy === 'challenge' ? <Loader2 size={16} className={styles.spin} /> : null}
          Email recovery code
        </button>
        <label className={styles.label}>
          Verification code
          <input
            type="text"
            className={styles.input}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
        </label>
        <button
          type="button"
          className={styles.secondaryBtn}
          disabled={busy === 'verify' || !code.trim()}
          onClick={() => void handleVerifyCode()}
        >
          {busy === 'verify' ? <Loader2 size={16} className={styles.spin} /> : null}
          Verify code
        </button>
        {stepUpToken ? (
          <>
            <label className={styles.label}>
              Recovery passphrase
              <input
                type="password"
                className={styles.input}
                value={restorePass}
                onChange={(e) => setRestorePass(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={busy === 'restore' || !restorePass}
              onClick={() => void handleRestore()}
            >
              {busy === 'restore' ? <Loader2 size={16} className={styles.spin} /> : null}
              Restore keys
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
};

export default E2eeRecoveryPanel;
