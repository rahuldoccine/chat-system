import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { overlayPanelEventProps } from '../utils/a11y';

const panelMotion = {
  initial: { opacity: 0, y: 14, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 14, scale: 0.98 },
  transition: { duration: 0.18 },
} as const;

type GroupActionsMotionPanelProps = {
  className: string;
  children: ReactNode;
};

/** Animated modal panel used for group-action overlays in MainLayout. */
export function GroupActionsMotionPanel({ className, children }: Readonly<GroupActionsMotionPanelProps>) {
  return (
    <motion.div className={className} {...panelMotion} {...overlayPanelEventProps}>
      {children}
    </motion.div>
  );
}
