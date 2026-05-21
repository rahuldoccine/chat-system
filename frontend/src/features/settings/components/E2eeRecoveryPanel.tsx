import React, { useState } from 'react';
import { Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import * as e2eeRecovery from '../../e2ee/recovery';
import styles from './E2eeRecoveryPanel.module.css';

const E2eeRecoveryPanel: React.FC = () => {
  const { user } = useAuth();
  const [passphrase, setPassphrase] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [code, setCode] = useState('');
  const [stepUpToken, setStepUpToken] = useState<string | null>(null);
  const [restorePass, setRestorePass] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

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
        Direct messages are always end-to-end encrypted. Save a recovery backup so you can restore
        keys on a new device after email verification.
      </p>

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
