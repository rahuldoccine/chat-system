import React from 'react';
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
  theme = 'dark',
}) => {
  return (
    <div className={`${styles.section} ${theme === 'light' ? styles.sectionLight : ''}`}>
      <div className={styles.options} role="radiogroup" aria-label="Group visibility">
        <label className={`${styles.option} ${disabled ? styles.optionDisabled : ''}`}>
          <input
            type="radio"
            name="groupVisibility"
            value="PUBLIC"
            checked={value === 'PUBLIC'}
            disabled={disabled}
            onChange={() => onChange('PUBLIC')}
          />
          <span className={styles.optionBody}>
            <span className={styles.optionLabel}>
              Public
            </span>
            <span className={styles.optionHint}>
              Open access. Any user can discover and join the group.
            </span>
          </span>
        </label>
        <label className={`${styles.option} ${disabled ? styles.optionDisabled : ''}`}>
          <input
            type="radio"
            name="groupVisibility"
            value="PRIVATE"
            checked={value === 'PRIVATE'}
            disabled={disabled}
            onChange={() => onChange('PRIVATE')}
          />
          <span className={styles.optionBody}>
            <span className={styles.optionLabel}>
              Private
            </span>
            <span className={styles.optionHint}>
              Restricted access. Only Owners and Moderators can add or manage members. Regular members cannot join directly
            </span>
          </span>
        </label>
      </div>
    </div>
  );
};

export default GroupVisibilitySection;
