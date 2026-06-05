import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

export type PipCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type PipSize = 'default' | 'compact';

export type PipPrefs = {
  corner: PipCorner;
  size: PipSize;
  hidden: boolean;
};

const STORAGE_KEY = 'call-local-pip-prefs';

const CORNERS: PipCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

function getDefaultCorner(): PipCorner {
  if (typeof window === 'undefined') return 'top-right';
  return window.matchMedia('(min-width: 577px)').matches ? 'top-right' : 'bottom-right';
}

function loadPrefs(): PipPrefs {
  if (typeof sessionStorage === 'undefined') {
    return { corner: getDefaultCorner(), size: 'default', hidden: false };
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { corner: getDefaultCorner(), size: 'default', hidden: false };
    const parsed = JSON.parse(raw) as Partial<PipPrefs>;
    const corner = CORNERS.includes(parsed.corner as PipCorner)
      ? (parsed.corner as PipCorner)
      : getDefaultCorner();
    const size = parsed.size === 'compact' ? 'compact' : 'default';
    return { corner, size, hidden: Boolean(parsed.hidden) };
  } catch {
    return { corner: getDefaultCorner(), size: 'default', hidden: false };
  }
}

function savePrefs(prefs: PipPrefs): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota errors */
  }
}

type Insets = { top: number; right: number; bottom: number; left: number };

function readInsets(stageEl: HTMLElement): Insets {
  const cs = getComputedStyle(stageEl);
  const inset = parseFloat(cs.getPropertyValue('--call-pip-inset')) || 16;
  const isNarrow = stageEl.clientWidth <= 576;
  return {
    top: isNarrow ? Math.max(inset, 8) : Math.max(inset, 12),
    right: inset,
    bottom: inset,
    left: inset,
  };
}

function readPipDimensions(stageEl: HTMLElement, size: PipSize): { width: number; height: number } {
  const cs = getComputedStyle(stageEl);
  let width = parseFloat(cs.getPropertyValue('--call-pip-width')) || 120;
  let height = parseFloat(cs.getPropertyValue('--call-pip-height')) || 160;
  if (size === 'compact') {
    width = Math.round(width * 0.75);
    height = Math.round(height * 0.75);
  }
  return { width, height };
}

function cornerPosition(
  corner: PipCorner,
  stageW: number,
  stageH: number,
  pipW: number,
  pipH: number,
  insets: Insets,
): { left: number; top: number } {
  switch (corner) {
    case 'top-left':
      return { left: insets.left, top: insets.top };
    case 'top-right':
      return { left: stageW - pipW - insets.right, top: insets.top };
    case 'bottom-left':
      return { left: insets.left, top: stageH - pipH - insets.bottom };
    case 'bottom-right':
      return { left: stageW - pipW - insets.right, top: stageH - pipH - insets.bottom };
  }
}

function nearestCorner(
  centerX: number,
  centerY: number,
  stageW: number,
  stageH: number,
  pipW: number,
  pipH: number,
  insets: Insets,
): PipCorner {
  let best: PipCorner = 'bottom-right';
  let bestDist = Infinity;
  for (const corner of CORNERS) {
    const pos = cornerPosition(corner, stageW, stageH, pipW, pipH, insets);
    const cx = pos.left + pipW / 2;
    const cy = pos.top + pipH / 2;
    const dist = (centerX - cx) ** 2 + (centerY - cy) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = corner;
    }
  }
  return best;
}

function clampPosition(
  left: number,
  top: number,
  stageW: number,
  stageH: number,
  pipW: number,
  pipH: number,
  insets: Insets,
): { left: number; top: number } {
  const minLeft = insets.left;
  const minTop = insets.top;
  const maxLeft = Math.max(minLeft, stageW - pipW - insets.right);
  const maxTop = Math.max(minTop, stageH - pipH - insets.bottom);
  return {
    left: Math.min(Math.max(left, minLeft), maxLeft),
    top: Math.min(Math.max(top, minTop), maxTop),
  };
}

export type UseLocalPipPositionOptions = {
  stageRef: RefObject<HTMLElement | null>;
  pipRef: RefObject<HTMLElement | null>;
};

export function useLocalPipPosition({ stageRef, pipRef }: UseLocalPipPositionOptions) {
  const [prefs, setPrefs] = useState<PipPrefs>(loadPrefs);
  const [dragOffset, setDragOffset] = useState<{ left: number; top: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ pointerX: number; pointerY: number; left: number; top: number } | null>(
    null,
  );
  const [layoutTick, setLayoutTick] = useState(0);

  const updatePrefs = useCallback((patch: Partial<PipPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const setHidden = useCallback(
    (hidden: boolean) => updatePrefs({ hidden }),
    [updatePrefs],
  );

  const toggleSize = useCallback(() => {
    updatePrefs({ size: prefs.size === 'compact' ? 'default' : 'compact' });
  }, [prefs.size, updatePrefs]);

  const setCorner = useCallback(
    (corner: PipCorner) => updatePrefs({ corner }),
    [updatePrefs],
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(() => setLayoutTick((t) => t + 1));
    ro.observe(stage);
    return () => ro.disconnect();
  }, [stageRef]);

  const computeStyle = useCallback((): CSSProperties => {
    const stage = stageRef.current;
    if (!stage) {
      return { position: 'absolute', visibility: 'hidden' };
    }

    const stageW = stage.clientWidth;
    const stageH = stage.clientHeight;
    const insets = readInsets(stage);
    const { width, height } = readPipDimensions(stage, prefs.size);

    let left: number;
    let top: number;

    if (dragOffset) {
      left = dragOffset.left;
      top = dragOffset.top;
    } else {
      const pos = cornerPosition(
        prefs.corner,
        stageW,
        stageH,
        width,
        height,
        insets,
      );
      left = pos.left;
      top = pos.top;
    }

    return {
      position: 'absolute',
      left,
      top,
      width,
      height,
      zIndex: 3,
      transition: isDragging ? 'none' : 'left 0.2s ease, top 0.2s ease, width 0.2s ease, height 0.2s ease',
    };
  }, [stageRef, prefs.corner, prefs.size, dragOffset, isDragging, layoutTick]);

  const computeChipStyle = useCallback((): CSSProperties => {
    const stage = stageRef.current;
    if (!stage) return { position: 'absolute', visibility: 'hidden' };

    const stageW = stage.clientWidth;
    const stageH = stage.clientHeight;
    const insets = readInsets(stage);
    const chipW = 120;
    const chipH = 36;
    const pos = cornerPosition(prefs.corner, stageW, stageH, chipW, chipH, insets);

    return {
      position: 'absolute',
      left: pos.left,
      top: pos.top,
      zIndex: 3,
    };
  }, [stageRef, prefs.corner, layoutTick]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const stage = stageRef.current;
      const pip = pipRef.current;
      if (!stage || !pip) return;

      e.currentTarget.setPointerCapture(e.pointerId);
      const stageRect = stage.getBoundingClientRect();
      const pipRect = pip.getBoundingClientRect();

      const left = pipRect.left - stageRect.left;
      const top = pipRect.top - stageRect.top;

      dragStart.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        left,
        top,
      };
      setDragOffset({ left, top });
      setIsDragging(true);
    },
    [stageRef, pipRef],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStart.current || !stageRef.current) return;
      const stage = stageRef.current;
      const insets = readInsets(stage);
      const { width, height } = readPipDimensions(stage, prefs.size);

      const dx = e.clientX - dragStart.current.pointerX;
      const dy = e.clientY - dragStart.current.pointerY;
      const rawLeft = dragStart.current.left + dx;
      const rawTop = dragStart.current.top + dy;
      const clamped = clampPosition(
        rawLeft,
        rawTop,
        stage.clientWidth,
        stage.clientHeight,
        width,
        height,
        insets,
      );
      setDragOffset(clamped);
    },
    [stageRef, prefs.size],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStart.current || !stageRef.current) return;
      const stage = stageRef.current;
      const insets = readInsets(stage);
      const { width, height } = readPipDimensions(stage, prefs.size);

      const centerX = (dragOffset?.left ?? dragStart.current.left) + width / 2;
      const centerY = (dragOffset?.top ?? dragStart.current.top) + height / 2;
      const snapped = nearestCorner(
        centerX,
        centerY,
        stage.clientWidth,
        stage.clientHeight,
        width,
        height,
        insets,
      );

      updatePrefs({ corner: snapped });
      dragStart.current = null;
      setDragOffset(null);
      setIsDragging(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
    [stageRef, dragOffset, prefs.size, updatePrefs],
  );

  const onPointerCancel = useCallback(() => {
    dragStart.current = null;
    setDragOffset(null);
    setIsDragging(false);
  }, []);

  return {
    prefs,
    pipStyle: computeStyle(),
    chipStyle: computeChipStyle(),
    isDragging,
    setHidden,
    toggleSize,
    setCorner,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
