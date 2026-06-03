import React from 'react';
import { motion } from 'framer-motion';
import styles from './HomeDashboard.module.css';

type StatItem = {
  label: string;
  value: number;
  accent: string;
};

type HomeDashboardStatsProps = {
  totalUnread: number;
  mentionUnread: number;
  channelCount: number;
  onlineDmCount: number;
};

const HomeDashboardStats: React.FC<HomeDashboardStatsProps> = ({
  totalUnread,
  mentionUnread,
  channelCount,
  onlineDmCount,
}) => {
  const stats: StatItem[] = [
    { label: 'Unread', value: totalUnread, accent: styles.statAccentRed },
    { label: 'Mentions', value: mentionUnread, accent: styles.statAccentIndigo },
    { label: 'Channels', value: channelCount, accent: styles.statAccentBlue },
    { label: 'Online DMs', value: onlineDmCount, accent: styles.statAccentGreen },
  ];

  return (
    <div className={styles.statsGrid}>
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          className={styles.statCard}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i, duration: 0.3 }}
        >
          <span className={`${styles.statValue} ${stat.accent}`}>{stat.value}</span>
          <span className={styles.statLabel}>{stat.label}</span>
        </motion.div>
      ))}
    </div>
  );
};

export default HomeDashboardStats;
