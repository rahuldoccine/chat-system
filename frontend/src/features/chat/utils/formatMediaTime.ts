/** mm:ss for audio/video duration display */
export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const totalSec = Math.floor(seconds);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Elapsed / total, e.g. 0:00 / 0:46 */
export function formatMediaTimeRange(elapsedSec: number, totalSec: number): string {
  return `${formatMediaTime(elapsedSec)} / ${formatMediaTime(totalSec)}`;
}
