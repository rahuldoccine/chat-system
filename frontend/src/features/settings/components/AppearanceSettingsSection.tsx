import React from 'react';
import type { ThemePreference } from '../../../context/ThemeContext';
import styles from '../../../pages/SettingsPage.module.css';

type AppearanceSettingsSectionProps = {
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
};

const THEME_OPTIONS: ThemePreference[] = ['light', 'dark', 'system'];

function themeOptionLabel(opt: ThemePreference): string {
  if (opt === 'system') return 'System default';
  return opt.charAt(0).toUpperCase() + opt.slice(1);
}

const AppearanceSettingsSection: React.FC<AppearanceSettingsSectionProps> = ({
  themePreference,
  onThemeChange,
}) => (
  <>
    <header className={styles.mainHeader}>
      <h2 className={styles.mainTitle}>Appearance</h2>
      <p className={styles.mainDescription}>Customize how Chat System looks on your device</p>
    </header>
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>Theme</h3>
      <p className={styles.mainDescription} style={{ marginBottom: '1rem' }}>
        Choose light, dark, or match your system setting.
      </p>
      <div className={styles.themeOptions} role="radiogroup" aria-label="Theme">
        {THEME_OPTIONS.map((opt) => (
          <label key={opt} className={styles.themeOption}>
            <input
              type="radio"
              name="theme"
              value={opt}
              checked={themePreference === opt}
              onChange={() => onThemeChange(opt)}
            />
            <span>{themeOptionLabel(opt)}</span>
          </label>
        ))}
      </div>
    </section>
  </>
);

export default AppearanceSettingsSection;
