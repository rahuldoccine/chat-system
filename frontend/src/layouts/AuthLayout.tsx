import React from 'react';
import styles from './AuthLayout.module.css';
import { motion } from 'framer-motion';
import AuthBrandHeader from '../components/brand/AuthBrandHeader';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div className={styles.container}>
      {/* Animated Mesh Gradient Background */}
      <div className={styles.background}>
        <div className={styles.circle1}></div>
        <div className={styles.circle2}></div>
        <div className={styles.circle3}></div>
      </div>

      <div className={styles.content}>
        <AuthBrandHeader />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={styles.cardWrapper}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
};

export default AuthLayout;
