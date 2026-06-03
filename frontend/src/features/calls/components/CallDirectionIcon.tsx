import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { CallDirection } from '../utils/callHistory.helpers';

export type CallDirectionIconClassNames = Readonly<{
  outgoing: string;
  missed: string;
  incoming: string;
}>;

type CallDirectionIconProps = Readonly<{
  direction: CallDirection;
  classNames: CallDirectionIconClassNames;
}>;

export function CallDirectionIcon({ direction, classNames }: CallDirectionIconProps) {
  if (direction === 'dialed') {
    return (
      <span className={classNames.outgoing} aria-label="Outgoing call">
        <ArrowUpRight size={14} strokeWidth={2.5} />
      </span>
    );
  }
  if (direction === 'missed') {
    return (
      <span className={classNames.missed} aria-label="Missed call">
        <ArrowDownLeft size={14} strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className={classNames.incoming} aria-label="Incoming call">
      <ArrowDownLeft size={14} strokeWidth={2.5} />
    </span>
  );
}
