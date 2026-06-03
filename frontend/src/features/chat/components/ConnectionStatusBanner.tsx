import React from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { useSocket } from '../../../context/SocketContext';
import styles from './ConnectionStatusBanner.module.css';

const ConnectionStatusBanner: React.FC = () => {
  const { isConnected } = useSocket();

  if (isConnected) return null;

  return (
    <output className={styles.banner} aria-live="polite">
      <WifiOff size={16} aria-hidden />
      <span>Connection lost. Reconnecting…</span>
      <Loader2 size={16} className={styles.spinner} aria-hidden />
    </output>
  );
};

export default ConnectionStatusBanner;
