/** Respect OS reduced-motion preference for Framer Motion and CSS. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const motionTransition = {
  duration: prefersReducedMotion() ? 0 : 0.2,
};

export const motionSlideY = {
  initial: prefersReducedMotion() ? false : { y: -50, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: prefersReducedMotion() ? undefined : { y: -50, opacity: 0 },
  transition: motionTransition,
};

export const motionFade = {
  initial: prefersReducedMotion() ? false : { opacity: 0 },
  animate: { opacity: 1 },
  exit: prefersReducedMotion() ? undefined : { opacity: 0 },
  transition: motionTransition,
};
