import React from 'react';
import styles from './ChatListSkeleton.module.css';

type ChatListSkeletonProps = {
  rows?: number;
};

const ChatListSkeleton: React.FC<ChatListSkeletonProps> = ({ rows = 7 }) => (
  <div className={styles.root} aria-hidden aria-label="Loading conversations">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className={styles.row}>
        <div className={styles.avatar} />
        <div className={styles.lines}>
          <div className={`${styles.line} ${styles.lineShort}`} />
        </div>
      </div>
    ))}
  </div>
);

export default ChatListSkeleton;
