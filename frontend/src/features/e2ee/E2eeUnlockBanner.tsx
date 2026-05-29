import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import styles from './E2eeUnlockBanner.module.css';

const E2eeUnlockBanner: React.FC = () => {
  const { e2eeKeysLocked, logout } = useAuth();
  const navigate = useNavigate();

  if (!e2eeKeysLocked) return null;

  const handleSignInAgain = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className={styles.banner} role="alert">
      <ShieldAlert size={18} aria-hidden />
      <p className={styles.text}>
        Your encryption keys are stored on this account but are not loaded on this device.
        Use the unlock dialog to enter your password, or sign in again. Settings → Privacy has
        account recovery if you reset your password by email.
      </p>
      <button type="button" className={styles.action} onClick={() => void handleSignInAgain()}>
        Sign in again
      </button>
    </div>
  );
};

export default E2eeUnlockBanner;
