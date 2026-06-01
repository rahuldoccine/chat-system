import React, { useEffect, useRef, useState } from 'react';
import styles from './ConnectionStatus.module.css';
import { useSocket } from '../../../context/SocketContext';
import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { motionSlideY } from '../../../utils/motion';

const ConnectionStatus: React.FC = () => {
  const { isConnected } = useSocket();
  const [showConnected, setShowConnected] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const [browserOffline, setBrowserOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const wasConnectedRef = useRef(false);

  useEffect(() => {
    const onOnline = () => setBrowserOffline(false);
    const onOffline = () => setBrowserOffline(true);
    globalThis.addEventListener('online', onOnline);
    globalThis.addEventListener('offline', onOffline);
    return () => {
      globalThis.removeEventListener('online', onOnline);
      globalThis.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (isConnected) {
      setShowOffline(false);
      if (wasConnectedRef.current) {
        setShowConnected(true);
        const timer = globalThis.setTimeout(() => setShowConnected(false), 2500);
        return () => globalThis.clearTimeout(timer);
      }
      wasConnectedRef.current = true;
      return;
    }

    if (wasConnectedRef.current) {
      setShowOffline(true);
      setShowConnected(false);
    }
  }, [isConnected]);

  const showBrowserOffline = browserOffline && !showOffline;

  return (
    <AnimatePresence>
      {(showOffline || showBrowserOffline) && (
        <motion.div
          {...motionSlideY}
          className={`${styles.bar} ${styles.offline}`}
        >
          <div className={styles.content}>
            <WifiOff size={16} />
            <span>
              {showBrowserOffline
                ? "You're offline — messages will send when you're back online"
                : 'Connection lost. Reconnecting...'}
            </span>
            {!showBrowserOffline && <RefreshCw size={14} className={styles.spinner} />}
          </div>
        </motion.div>
      )}

      {showConnected && !browserOffline && (
        <motion.div
          {...motionSlideY}
          className={`${styles.bar} ${styles.online}`}
        >
          <div className={styles.content}>
            <CheckCircle2 size={16} />
            <span>Connected</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConnectionStatus;
