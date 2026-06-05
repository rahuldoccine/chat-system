import React from 'react';
import { Globe, Lock } from 'lucide-react';
import a11yStyles from '../../../styles/a11y.module.css';
import styles from './GroupVisibilitySection.module.css';

export type GroupVisibility = 'PUBLIC' | 'PRIVATE';

type GroupVisibilitySectionProps = {
  value: GroupVisibility;
  onChange: (value: GroupVisibility) => void;
  disabled?: boolean;
  theme?: 'dark' | 'light';
};

const GroupVisibilitySection: React.FC<GroupVisibilitySectionProps> = ({
  value,
  onChange,
  disabled = false,
  theme = 'light',
}) => {
  return (
    <fieldset
      className={`${styles.section} ${theme === 'dark' ? styles.sectionDark : styles.sectionLight}`}
      disabled={disabled}
    >
      <legend className={a11yStyles.srOnly}>Group visibility</legend>
      <div className={styles.grid} role="radiogroup" aria-label="Group visibility">
        <label
          className={`${styles.card} ${value === 'PUBLIC' ? styles.cardSelected : ''} ${
            disabled ? styles.cardDisabled : ''
          }`}
        >
          <input
            type="radio"
            name="groupVisibility"
            value="PUBLIC"
            className={a11yStyles.srOnly}
            checked={value === 'PUBLIC'}
            disabled={disabled}
            onChange={() => onChange('PUBLIC')}
          />
          <span className={styles.cardIcon} aria-hidden>
            <Globe size={16} />
          </span>
          <span className={styles.cardTitle}>Public</span>
          <span className={styles.cardDesc}>Anyone can discover and join</span>
        </label>
        <label
          className={`${styles.card} ${value === 'PRIVATE' ? styles.cardSelected : ''} ${
            disabled ? styles.cardDisabled : ''
          }`}
        >
          <input
            type="radio"
            name="groupVisibility"
            value="PRIVATE"
            className={a11yStyles.srOnly}
            checked={value === 'PRIVATE'}
            disabled={disabled}
            onChange={() => onChange('PRIVATE')}
          />
          <span className={styles.cardIcon} aria-hidden>
            <Lock size={16} />
          </span>
          <span className={styles.cardTitle}>Private</span>
          <span className={styles.cardDesc}>Invite only — Owner / Mod adds members</span>
        </label>
      </div>
    </fieldset>
  );
};

export default GroupVisibilitySection;
