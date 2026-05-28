import React from 'react';
import { Hash, Lock } from 'lucide-react';
import type { GroupVisibility } from '../types';

type GroupChannelIconProps = {
  visibility?: GroupVisibility;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

/** Sidebar / list icon: public channels use #, private channels use lock. */
const GroupChannelIcon: React.FC<GroupChannelIconProps> = ({
  visibility = 'PRIVATE',
  size = 18,
  strokeWidth = 2.5,
  className,
}) => {
  if (visibility === 'PUBLIC') {
    return <Hash size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
  }
  return <Lock size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
};

export default GroupChannelIcon;
