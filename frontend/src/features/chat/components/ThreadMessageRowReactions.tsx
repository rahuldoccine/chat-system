import React from 'react';
import type { Message } from '../types';
import styles from './ThreadMessageRow.module.css';

type Props = {
  msg: Message;
  onReactionPick: (emoji: string) => void;
};

const ThreadMessageRowReactions: React.FC<Props> = ({ msg, onReactionPick }) => {
  if (!msg.reactionsSummary?.length) return null;
  return (
    <div className={styles.reactions}>
      {msg.reactionsSummary.map((r) => (
        <button
          key={r.emoji}
          type="button"
          className={`${styles.reaction} ${r.byMe ? styles.reactionMine : ''}`}
          onClick={() => onReactionPick(r.emoji)}
        >
          <span>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}
    </div>
  );
};

export default ThreadMessageRowReactions;
