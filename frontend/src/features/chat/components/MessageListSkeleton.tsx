import React from 'react';
import styles from './MessageListSkeleton.module.css';

type MessageListSkeletonProps = {
  count?: number;
};

const MessageListSkeleton: React.FC<MessageListSkeletonProps> = ({ count = 6 }) => (
  <div className={styles.root} aria-hidden aria-label="Loading messages">
    {Array.from({ length: count }, (_, i) => (
      <div
        key={i}
        className={`${styles.row} ${i % 2 === 0 ? styles.left : styles.right}`}
      >
        <div className={styles.bubble} />
      </div>
    ))}
  </div>
);

export default MessageListSkeleton;
