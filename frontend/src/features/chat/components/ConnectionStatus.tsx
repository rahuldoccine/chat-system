import React, { useState, useEffect } from 'react';
import styles from './ConnectionStatus.module.css';
import { useSocket } from '../../../context/SocketContext';
import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ConnectionStatus: React.FC = () => {
  const { isConnected } = useSocket();
  const [showConnected, setShowConnected] = useState(false);
  const [wasDisconnected, setWasDisconnected] = useState(false);

  useEffect(() => {
    if (!isConnected) {
      setWasDisconnected(true);
      setShowConnected(false);
    } else if (wasDisconnected) {
      setShowConnected(true);
      const timer = setTimeout(() => {
        setShowConnected(false);
        setWasDisconnected(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isConnected, wasDisconnected]);

  return (
    <AnimatePresence>
      {!isConnected && (
        <motion.div 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          className={`${styles.bar} ${styles.offline}`}
        >
          <div className={styles.content}>
            <WifiOff size={16} />
            <span>Connection lost. Reconnecting...</span>
            <RefreshCw size={14} className={styles.spinner} />
          </div>
        </motion.div>
      )}

      {showConnected && (
        <motion.div 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
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
