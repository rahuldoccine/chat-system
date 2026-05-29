import React from 'react';
import type { LucideIcon } from 'lucide-react';
import styles from './EmptyState.module.css';

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
};

const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  hint,
  actionLabel,
  onAction,
  compact = false,
}) => (
  <div className={`${styles.root} ${compact ? styles.compact : ''}`}>
    {Icon && (
      <div className={styles.iconWrap} aria-hidden>
        <Icon size={compact ? 28 : 36} strokeWidth={1.5} />
      </div>
    )}
    <p className={styles.title}>{title}</p>
    {hint && <p className={styles.hint}>{hint}</p>}
    {actionLabel && onAction && (
      <button type="button" className={styles.action} onClick={onAction}>
        {actionLabel}
      </button>
    )}
  </div>
);

export default EmptyState;
