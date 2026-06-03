import React from 'react';
import AdminReportsPanel from './AdminReportsPanel';
import styles from '../../../pages/SettingsPage.module.css';

const ReportsSettingsSection: React.FC = () => (
  <>
    <header className={styles.mainHeader}>
      <h2 className={styles.mainTitle}>Reports</h2>
      <p className={styles.mainDescription}>Review user reports submitted from direct messages</p>
    </header>
    <section className={styles.card}>
      <AdminReportsPanel />
    </section>
  </>
);

export default ReportsSettingsSection;
