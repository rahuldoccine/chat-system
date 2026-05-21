/** Far-future mute end (API accepts any future ISO datetime). */
const INDEFINITE_MUTE_UNTIL = '2099-12-31T23:59:59.000Z';

export function muteUntilIndefinite(): string {
  return INDEFINITE_MUTE_UNTIL;
}

export function isChatMuted(mutedUntil: string | null | undefined): boolean {
  if (!mutedUntil) return false;
  const until = new Date(mutedUntil).getTime();
  if (Number.isNaN(until)) return false;
  return until > Date.now();
}
