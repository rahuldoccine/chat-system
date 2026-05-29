import React, { useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import styles from './E2eeUnlockModal.module.css';

const E2eeUnlockModal: React.FC = () => {
  const { e2eeKeysLocked, unlockE2eeWithPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (!e2eeKeysLocked) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password.trim()) return;
    setBusy(true);
    try {
      await unlockE2eeWithPassword(password);
      setPassword('');
      toast.success('Encryption keys unlocked');
    } catch {
      toast.error('Could not unlock keys. Check your password and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="e2ee-unlock-title">
      <div className={styles.modal}>
        <div className={styles.header}>
          <ShieldAlert size={22} aria-hidden />
          <h2 id="e2ee-unlock-title">Unlock encrypted messages</h2>
        </div>
        <p className={styles.hint}>
          Your encryption keys are stored on this account but are not loaded on this device.
          Enter your sign-in password to restore them without signing out.
        </p>
        <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
          <label className={styles.label}>
            Account password
            <input
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </label>
          <button type="submit" className={styles.primaryBtn} disabled={busy || !password}>
            {busy ? <Loader2 size={16} className={styles.spin} aria-hidden /> : null}
            Unlock keys
          </button>
        </form>
      </div>
    </div>
  );
};

export default E2eeUnlockModal;
