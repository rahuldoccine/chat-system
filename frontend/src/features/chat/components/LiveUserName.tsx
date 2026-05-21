import React from 'react';
import { useLiveDisplayName } from '../../settings/hooks/useLiveDisplayName';

type LiveUserNameProps = {
  userId?: string;
  displayName?: string | null;
  email?: string;
  className?: string;
};

/** Renders a user label that stays in sync when the current user edits their display name. */
const LiveUserName: React.FC<LiveUserNameProps> = ({
  userId,
  displayName,
  email,
  className,
}) => {
  const name = useLiveDisplayName(userId, displayName, email);
  return <span className={className}>{name}</span>;
};

export default LiveUserName;
