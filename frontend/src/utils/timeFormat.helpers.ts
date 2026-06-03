export function pluralizeUnit(value: number, unit: string): string {
  const label = value === 1 ? unit : `${unit}s`;
  return `${value} ${label}`;
}

export function diffInSeconds(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 1000);
}

export function diffInLocalDays(from: Date, to: Date): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

export function formatRelativeSecondsAgo(diffInSeconds: number): string | null {
  if (diffInSeconds < 60) return 'a few seconds ago';
  return null;
}

export function formatRelativeMinutesAgo(diffInSeconds: number): string | null {
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${pluralizeUnit(diffInMinutes, 'minute')} ago`;
  return null;
}

export function formatRelativeHoursAgo(diffInSeconds: number): string | null {
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${pluralizeUnit(diffInHours, 'hour')} ago`;
  return null;
}

export function formatRelativeDaysAgo(diffInSeconds: number): string | null {
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return 'yesterday';
  if (diffInDays < 7) return `${pluralizeUnit(diffInDays, 'day')} ago`;
  return null;
}

export function formatRelativeWeeksAgo(diffInSeconds: number): string | null {
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);
  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) return `${pluralizeUnit(diffInWeeks, 'week')} ago`;
  return null;
}

export function formatRelativeMonthsAgo(diffInSeconds: number): string | null {
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${pluralizeUnit(diffInMonths, 'month')} ago`;
  return null;
}

export function formatRelativeYearsAgo(diffInSeconds: number): string {
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);
  const diffInYears = Math.floor(diffInDays / 365);
  return `${pluralizeUnit(diffInYears, 'year')} ago`;
}
