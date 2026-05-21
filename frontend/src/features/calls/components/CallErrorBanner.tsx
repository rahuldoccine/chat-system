import React from 'react';
import { createPortal } from 'react-dom';
import styles from './CallErrorBanner.module.css';

type CallErrorBannerProps = {
  message: string;
  onDismiss: () => void;
};

const CallErrorBanner: React.FC<CallErrorBannerProps> = ({ message, onDismiss }) => {
  return createPortal(
    <div className={styles.wrap} role="alert">
      <span className={styles.text}>{message}</span>
      <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>,
    document.body,
  );
};

export default CallErrorBanner;
