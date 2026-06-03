import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import UserAvatar from './UserAvatar';
import streamStyles from './MessageStream.module.css';
import styles from './TypingIndicator.module.css';

export type TypingIndicatorProps = {
  visible: boolean;
  /** Screen reader label, e.g. "Demo One is typing" */
  label: string;
  userId?: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  email?: string;
};

const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  visible,
  label,
  userId,
  avatarUrl,
  displayName,
  email,
}) => (
  <AnimatePresence>
    {visible ? (
      <motion.output
        key="typing-bubble"
        className={`${streamStyles.messageWrapper} ${styles.row}`}
        aria-live="polite"
        aria-label={label}
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.98 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        <UserAvatar
          userId={userId}
          avatarUrl={avatarUrl}
          displayName={displayName}
          email={email}
          className={streamStyles.avatar}
        />
        <div className={styles.bubbleContent}>
          <div className={styles.typingBubble} aria-hidden>
            <span className={styles.dots}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </span>
          </div>
        </div>
      </motion.output>
    ) : null}
  </AnimatePresence>
);

export default TypingIndicator;
