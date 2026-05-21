export function formatLastSeen(dateInput: string | Date): string {
  const date = new Date(dateInput);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'a few seconds ago';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) {
    return 'yesterday';
  }
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks} week${diffInWeeks === 1 ? '' : 's'} ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths === 1 ? '' : 's'} ago`;
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears} year${diffInYears === 1 ? '' : 's'} ago`;
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

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
  const todayStart = startOfLocalDay(now).getTime();
  const msgStart = startOfLocalDay(date).getTime();
  const diffDays = Math.round((todayStart - msgStart) / 86_400_000);

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
  const todayStart = startOfLocalDay(now).getTime();
  const msgStart = startOfLocalDay(date).getTime();
  const diffDays = Math.round((todayStart - msgStart) / 86_400_000);
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
