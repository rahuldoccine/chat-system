import React from 'react';
import { motion } from 'framer-motion';
import ChatSystemLogo from './ChatSystemLogo';
import styles from './ChatSystemLogo.module.css';

const AuthBrandHeader: React.FC = () => (
  <motion.div
    className={styles.authHeader}
    initial={{ opacity: 0, y: -12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.45, ease: 'easeOut' }}
  >
    <ChatSystemLogo
      variant="stacked"
      size="xl"
      theme="dark"
      showSubtitle={false}
      glow
      animated
    />
    <p className={styles.authTagline}>Connect. Collaborate. Chat securely.</p>
  </motion.div>
);

export default AuthBrandHeader;
