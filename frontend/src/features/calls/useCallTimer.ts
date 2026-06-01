import { useEffect, useState } from 'react';

export function useCallTimer(active: boolean, startedAt: number | null): string {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active || !startedAt) return;
    const id = globalThis.setInterval(() => setNow(Date.now()), 1000);
    return () => globalThis.clearInterval(id);
  }, [active, startedAt]);

  if (!active || !startedAt) return '00:00';
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
