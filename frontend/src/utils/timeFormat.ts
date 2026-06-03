import {
  diffInLocalDays,
  formatRelativeDaysAgo,
  formatRelativeHoursAgo,
  formatRelativeMinutesAgo,
  formatRelativeMonthsAgo,
  formatRelativeSecondsAgo,
  formatRelativeWeeksAgo,
  formatRelativeYearsAgo,
} from './timeFormat.helpers';

export function formatLastSeen(dateInput: string | Date): string {
  const date = new Date(dateInput);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  const relative =
    formatRelativeSecondsAgo(diffInSeconds) ??
    formatRelativeMinutesAgo(diffInSeconds) ??
    formatRelativeHoursAgo(diffInSeconds) ??
    formatRelativeDaysAgo(diffInSeconds) ??
    formatRelativeWeeksAgo(diffInSeconds) ??
    formatRelativeMonthsAgo(diffInSeconds);

  if (relative) return relative;
  return formatRelativeYearsAgo(diffInSeconds);
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function toDateKey(dateInput: string | Date): string {
  const d = new Date(dateInput);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Divider between message groups: Today, Yesterday, or "Sunday, May 5th". */
export function formatMessageDateDividerLabel(dateInput: string | Date): string {
  const date = new Date(dateInput);
  const now = new Date();
  const diffDays = diffInLocalDays(date, now);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  return `${weekday}, ${month} ${ordinal(date.getDate())}`;
}

/** WhatsApp-style call log time, e.g. "Yesterday, 11:31 am" or "8 November, 10:29 pm". */
export function formatCallHistoryTimestamp(dateInput: string | Date): string {
  const date = new Date(dateInput);
  const now = new Date();
  const diffDays = diffInLocalDays(date, now);
  const time = date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();

  if (diffDays === 0) return `Today, ${time}`;
  if (diffDays === 1) return `Yesterday, ${time}`;

  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  return `${day} ${month}, ${time}`;
}

/** e.g. "May 5th at 12:40 PM" */
export function formatChatTimestamp(dateInput: string | Date): string {
  const date = new Date(dateInput);
  const month = date.toLocaleString('en-US', { month: 'long' });
  const day = ordinal(date.getDate());
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const year = date.getFullYear();
  const now = new Date();
  const sameYear = year === now.getFullYear();
  if (sameYear) {
    return `${month} ${day} at ${time}`;
  }
  return `${month} ${day}, ${year} at ${time}`;
}
