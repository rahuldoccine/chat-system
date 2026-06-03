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
        <label
          htmlFor="group-visibility-public"
          className={`${styles.option} ${disabled ? styles.optionDisabled : ''}`}
        >
          <span id="group-visibility-public-label" className={styles.optionLabel}>
            Public
          </span>
          <input
            id="group-visibility-public"
            type="radio"
            name="groupVisibility"
            value="PUBLIC"
            checked={value === 'PUBLIC'}
            disabled={disabled}
            onChange={() => onChange('PUBLIC')}
            aria-labelledby="group-visibility-public-label group-visibility-public-hint"
          />
          <span className={styles.optionBody}>
            <span className={styles.optionHint} id="group-visibility-public-hint">
              Open access. Any user can discover and join the group.
            </span>
          </span>
        </label>
        <label
          htmlFor="group-visibility-private"
          className={`${styles.option} ${disabled ? styles.optionDisabled : ''}`}
        >
          <span id="group-visibility-private-label" className={styles.optionLabel}>
            Private
          </span>
          <input
            id="group-visibility-private"
            type="radio"
            name="groupVisibility"
            value="PRIVATE"
            checked={value === 'PRIVATE'}
            disabled={disabled}
            onChange={() => onChange('PRIVATE')}
            aria-labelledby="group-visibility-private-label group-visibility-private-hint"
          />
          <span className={styles.optionBody}>
            <span className={styles.optionHint} id="group-visibility-private-hint">
              Restricted access. Only Owners and Moderators can add or manage members. Regular members cannot join directly
            </span>
          </span>
        </label>
      </div>
    </div>
  );
};

export default GroupVisibilitySection;
