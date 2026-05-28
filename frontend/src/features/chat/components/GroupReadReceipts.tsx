import React from 'react';

/** Optional aggregate read state for group messages (Phase 5 polish). */
const GroupReadReceipts: React.FC<{ count: number }> = ({ count }) =>
  count > 0 ? <span style={{ fontSize: 11, opacity: 0.7 }}>Seen by {count}</span> : null;

export default GroupReadReceipts;
