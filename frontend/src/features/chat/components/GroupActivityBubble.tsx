import React from 'react';
import styles from './GroupActivityBubble.module.css';

export type GroupActivityMeta = {
  type: string;
  actorId: string;
  actorName?: string;
  targetUserId?: string;
  targetName?: string;
  newRole?: string;
  title?: string;
};

type GroupActivityBubbleProps = {
  ciphertext: string | null;
  meta?: GroupActivityMeta;
};

const GroupActivityBubble: React.FC<GroupActivityBubbleProps> = ({ ciphertext }) => (
  <div className={styles.wrap}>
    <span className={styles.pill}>{ciphertext ?? 'Group updated'}</span>
  </div>
);

export function getGroupActivityFromMeta(
  contentMeta: unknown,
): GroupActivityMeta | null {
  if (!contentMeta || typeof contentMeta !== 'object') return null;
  const ga = (contentMeta as { groupActivity?: unknown }).groupActivity;
  if (!ga || typeof ga !== 'object') return null;
  const m = ga as GroupActivityMeta;
  return m.type ? m : null;
}

export default GroupActivityBubble;
