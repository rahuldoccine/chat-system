import { useEffect, useState } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

const MOBILE_MAX = 576;
const TABLET_MAX = 1024;

function getBreakpoint(width: number): Breakpoint {
  if (width <= MOBILE_MAX) return 'mobile';
  if (width <= TABLET_MAX) return 'tablet';
  return 'desktop';
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() =>
    typeof window !== 'undefined' ? getBreakpoint(window.innerWidth) : 'desktop',
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const update = () => {
      setBp(getBreakpoint(window.innerWidth));
    };

    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(update, 100);
    };

    const mobileMq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const tabletMq = window.matchMedia(`(max-width: ${TABLET_MAX}px)`);

    mobileMq.addEventListener('change', onResize);
    tabletMq.addEventListener('change', onResize);
    window.addEventListener('orientationchange', onResize);

    return () => {
      clearTimeout(timer);
      mobileMq.removeEventListener('change', onResize);
      tabletMq.removeEventListener('change', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return bp;
}

export function useIsMobile(): boolean {
  return useBreakpoint() === 'mobile';
}
