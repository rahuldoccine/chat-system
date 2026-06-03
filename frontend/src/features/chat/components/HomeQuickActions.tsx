import React from 'react';
import { motion } from 'framer-motion';
import { MessageSquarePlus, Search, Users } from 'lucide-react';
import styles from './HomeDashboard.module.css';

function dispatchUiAction(name: 'chat:open-new-dm' | 'chat:open-create-group' | 'chat:open-jump-to') {
  globalThis.dispatchEvent(new CustomEvent(name));
}

const HomeQuickActions: React.FC = () => (
  <motion.section
    className={styles.panel}
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.15, duration: 0.35 }}
  >
    <div className={styles.panelHeader}>
      <h2>Quick actions</h2>
      <p>Jump in with one click</p>
    </div>
    <div className={styles.actionsGrid}>
      <button
        type="button"
        className={styles.actionCard}
        onClick={() => dispatchUiAction('chat:open-new-dm')}
      >
        <span className={`${styles.actionIcon} ${styles.actionIconPrimary}`}>
          <MessageSquarePlus size={20} />
        </span>
        <span className={styles.actionTitle}>New message</span>
        <span className={styles.actionHint}>Start a direct chat</span>
      </button>
      <button
        type="button"
        className={styles.actionCard}
        onClick={() => dispatchUiAction('chat:open-create-group')}
      >
        <span className={`${styles.actionIcon} ${styles.actionIconViolet}`}>
          <Users size={20} />
        </span>
        <span className={styles.actionTitle}>Create group</span>
        <span className={styles.actionHint}>Channels & teams</span>
      </button>
      <button
        type="button"
        className={styles.actionCard}
        onClick={() => dispatchUiAction('chat:open-jump-to')}
      >
        <span className={`${styles.actionIcon} ${styles.actionIconSlate}`}>
          <Search size={20} />
        </span>
        <span className={styles.actionTitle}>Jump to…</span>
        <span className={styles.actionHint}>
          <kbd className={styles.kbd}>Ctrl</kbd>+<kbd className={styles.kbd}>K</kbd>
        </span>
      </button>
    </div>
  </motion.section>
);

export default HomeQuickActions;
