import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LinkDisplayMode } from '../types';

export const LINK_PREVIEW_MENU_WIDTH = 200;
export const LINK_PREVIEW_MENU_ESTIMATE_HEIGHT = 280;
const MENU_WIDTH = LINK_PREVIEW_MENU_WIDTH;
const MENU_ESTIMATE_HEIGHT = LINK_PREVIEW_MENU_ESTIMATE_HEIGHT;
const VIEWPORT_PAD = 8;

function menuPosition(trigger: HTMLElement, menuHeight: number, menuWidth: number) {
  const rect = trigger.getBoundingClientRect();
  const top = Math.max(VIEWPORT_PAD, rect.top - menuHeight - 4);
  const left = Math.max(
    VIEWPORT_PAD,
    Math.min(rect.right - menuWidth, globalThis.innerWidth - menuWidth - VIEWPORT_PAD),
  );
  return { top, left };
}

export function useLinkPreviewMenu(mode: LinkDisplayMode) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuPos(null);
  }, []);

  useEffect(() => {
    closeMenu();
  }, [mode, closeMenu]);

  const syncMenuPos = useCallback(() => {
    const trigger = menuTriggerRef.current;
    if (!trigger) return;
    const h = menuPanelRef.current?.offsetHeight ?? MENU_ESTIMATE_HEIGHT;
    const w = menuPanelRef.current?.offsetWidth ?? MENU_WIDTH;
    setMenuPos(menuPosition(trigger, h, w));
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPos(null);
      return;
    }
    syncMenuPos();
    const el = menuPanelRef.current;
    const ro = el ? new ResizeObserver(syncMenuPos) : null;
    if (el && ro) ro.observe(el);
    globalThis.addEventListener('resize', syncMenuPos);
    globalThis.addEventListener('scroll', syncMenuPos, true);
    return () => {
      ro?.disconnect();
      globalThis.removeEventListener('resize', syncMenuPos);
      globalThis.removeEventListener('scroll', syncMenuPos, true);
    };
  }, [menuOpen, syncMenuPos]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuTriggerRef.current?.contains(t) || menuPanelRef.current?.contains(t)) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, closeMenu]);

  const openMenuAtTrigger = useCallback((trigger: HTMLElement) => {
    setMenuPos(menuPosition(trigger, MENU_ESTIMATE_HEIGHT, MENU_WIDTH));
    setMenuOpen(true);
  }, []);

  return {
    menuOpen,
    setMenuOpen,
    menuPos,
    menuTriggerRef,
    menuPanelRef,
    closeMenu,
    openMenuAtTrigger,
  };
}
