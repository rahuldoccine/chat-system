import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Home } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import ChatSystemLogo from '../components/brand/ChatSystemLogo';
import styles from './NotFoundPage.module.css';

const NotFoundPage: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const homeHref = isAuthenticated ? '/' : '/login';
  const homeLabel = isAuthenticated ? 'Back to chat' : 'Go to sign in';

  return (
    <div className={styles.page}>
      <motion.div
        className={styles.logo}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <ChatSystemLogo variant="stacked" size="md" theme="dark" showSubtitle={false} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08 }}
      >
        <p className={styles.code} aria-hidden>
          404
        </p>
        <h1 className={styles.title}>Page not found</h1>
        <p className={styles.message}>
          This link does not exist or may have moved. Check the URL or return to a safe place in
          Chat System.
        </p>

        <div className={styles.actions}>
          {!isLoading && (
            <Link to={homeHref} className={styles.primaryBtn}>
              <Home size={16} />
              {homeLabel}
            </Link>
          )}
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => globalThis.history.back()}
          >
            <ArrowLeft size={16} />
            Go back
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default NotFoundPage;
