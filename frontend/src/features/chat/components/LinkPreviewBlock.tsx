import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import styles from './LinkPreviewBlock.module.css';
import type { LinkDisplayMode, LinkPreviewMeta } from '../types';
import {
  faviconUrlForLink,
  inlineLinkTypeLabel,
  inlineSiteLabel,
  linkDisplayMode,
} from '../utils/linkPreviewUtils';

export type LinkPreviewBlockProps = {
  preview: LinkPreviewMeta;
  displayAs?: LinkDisplayMode;
  isEnriching?: boolean;
  onRemove?: () => void;
  onDisplayAsChange?: (mode: LinkDisplayMode) => void;
  variant?: 'message' | 'composer';
  bubbleVariant?: 'sent' | 'received';
};

const DISPLAY_OPTIONS: { id: LinkDisplayMode; label: string }[] = [
  { id: 'inline', label: 'Inline link' },
  { id: 'preview', label: 'Preview' },
  { id: 'url', label: 'URL' },
];

const MENU_WIDTH = 200;
const MENU_ESTIMATE_HEIGHT = 280;
const VIEWPORT_PAD = 8;

function stopBubble(e: React.MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
}

function menuPosition(trigger: HTMLElement, menuHeight: number, menuWidth: number) {
  const rect = trigger.getBoundingClientRect();
  const top = Math.max(VIEWPORT_PAD, rect.top - menuHeight - 4);
  const left = Math.max(
    VIEWPORT_PAD,
    Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - VIEWPORT_PAD),
  );
  return { top, left };
}

const LinkPreviewBlock: React.FC<LinkPreviewBlockProps> = ({
  preview,
  displayAs: displayAsProp,
  onRemove,
  onDisplayAsChange,
  variant = 'message',
  bubbleVariant,
  isEnriching = false,
}) => {
  const mode = displayAsProp ?? linkDisplayMode(preview);
  const isComposer = variant === 'composer';
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);

  const favicon = faviconUrlForLink(preview.url);
  const typeLabel = inlineLinkTypeLabel(preview);
  const siteLabel = inlineSiteLabel(preview);
  const cardTitle = preview.title?.trim() || typeLabel;

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
    window.addEventListener('resize', syncMenuPos);
    window.addEventListener('scroll', syncMenuPos, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', syncMenuPos);
      window.removeEventListener('scroll', syncMenuPos, true);
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

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(preview.url);
      toast.success('Link copied');
    } catch {
      toast.error("Couldn't copy the link");
    }
    closeMenu();
  };

  const openNewTab = () => {
    window.open(preview.url, '_blank', 'noopener,noreferrer');
    closeMenu();
  };

  const wrapClass = [
    styles.wrap,
    isComposer ? styles.composerWrap : styles.wrapMessage,
    bubbleVariant === 'sent' && styles.wrapSent,
    mode === 'preview' && styles.wrapPreview,
    mode === 'inline' && styles.wrapInline,
  ]
    .filter(Boolean)
    .join(' ');

  const menuPanel = menuOpen ? (
    <div
      ref={menuPanelRef}
      className={styles.menu}
      role="menu"
      style={
        menuPos
          ? { position: 'fixed', top: menuPos.top, left: menuPos.left, width: MENU_WIDTH, zIndex: 10000 }
          : { position: 'fixed', visibility: 'hidden', width: MENU_WIDTH, zIndex: 10000 }
      }
      onClick={stopBubble}
      onMouseDown={stopBubble}
    >
      <div className={styles.menuLabel}>Display as</div>
      {DISPLAY_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="menuitemradio"
          aria-checked={mode === opt.id}
          className={`${styles.menuItem} ${mode === opt.id ? styles.menuItemActive : ''}`}
          onMouseDown={stopBubble}
          onClick={(e) => {
            stopBubble(e);
            onDisplayAsChange?.(opt.id);
            closeMenu();
          }}
        >
          {opt.label}
          {mode === opt.id ? <Check size={16} className={styles.menuCheck} aria-hidden /> : null}
        </button>
      ))}
      <div className={styles.menuDivider} />
      <button type="button" role="menuitem" className={styles.menuItem} onMouseDown={stopBubble} onClick={(e) => { stopBubble(e); void copyLink(); }}>
        <Copy size={14} className={styles.menuItemIcon} aria-hidden />
        Copy link
      </button>
      <button type="button" role="menuitem" className={styles.menuItem} onMouseDown={stopBubble} onClick={(e) => { stopBubble(e); openNewTab(); }}>
        <ExternalLink size={14} className={styles.menuItemIcon} aria-hidden />
        Open in new tab
      </button>
      {onRemove ? (
        <>
          <div className={styles.menuDivider} />
          <button
            type="button"
            role="menuitem"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onMouseDown={stopBubble}
            onClick={(e) => {
              stopBubble(e);
              onRemove();
              closeMenu();
            }}
          >
            <Trash2 size={14} className={styles.menuItemIcon} aria-hidden />
            Delete
          </button>
        </>
      ) : null}
    </div>
  ) : null;

  const menuPortal =
    menuPanel && typeof document !== 'undefined' ? createPortal(menuPanel, document.body) : null;

  const moreButton = (buttonClass: string) => (
    <>
      <button
        ref={menuTriggerRef}
        type="button"
        className={buttonClass}
        aria-label="Link options"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={(e) => {
          stopBubble(e);
          const opening = !menuOpen;
          if (opening) {
            setMenuPos(
              menuPosition(e.currentTarget, MENU_ESTIMATE_HEIGHT, MENU_WIDTH),
            );
          } else {
            setMenuPos(null);
          }
          setMenuOpen(opening);
        }}
      >
        <MoreHorizontal size={buttonClass === styles.inlineMore ? 14 : 16} />
      </button>
      {menuPortal}
    </>
  );

  const linkActions = (btnClass: string) => (
    <div className={`${styles.linkActions} ${isComposer ? styles.linkActionsVisible : ''}`}>
      <button type="button" className={btnClass} aria-label="Copy link" onClick={(e) => { stopBubble(e); void copyLink(); }}>
        <Link2 size={15} />
      </button>
      <button type="button" className={btnClass} aria-label="Open in new tab" onClick={(e) => { stopBubble(e); openNewTab(); }}>
        <ExternalLink size={15} />
      </button>
      {moreButton(btnClass)}
    </div>
  );

  if (mode === 'url') {
    return (
      <div className={`${wrapClass} ${styles.urlWrap}`}>
        <div className={styles.urlBlock}>
          <a
            className={styles.urlLink}
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stopBubble}
          >
            {preview.url}
          </a>
          {linkActions(styles.actionBtn)}
        </div>
      </div>
    );
  }

  if (mode === 'inline') {
    return (
      <div className={wrapClass}>
        <div className={`${styles.inline} ${isEnriching ? styles.inlineEnriching : ''}`}>
          {favicon ? <img src={favicon} alt="" className={styles.inlineIcon} loading="lazy" /> : null}
          <a className={styles.inlineText} href={preview.url} target="_blank" rel="noopener noreferrer" onClick={stopBubble}>
            <span className={styles.inlineMuted}>{typeLabel} </span>
            <span className={styles.inlineBold}>{siteLabel}</span>
          </a>
          {moreButton(styles.inlineMore)}
        </div>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      <div className={styles.card}>
        {preview.imageUrl ? (
          <a className={styles.cardImageLink} href={preview.url} target="_blank" rel="noopener noreferrer" onClick={stopBubble}>
            <img className={styles.cardImage} src={preview.imageUrl} alt="" loading="lazy" />
          </a>
        ) : null}
        <div className={styles.cardBody}>
          <a className={styles.cardMain} href={preview.url} target="_blank" rel="noopener noreferrer" onClick={stopBubble}>
            <div className={styles.cardTitle}>{cardTitle}</div>
            <div className={styles.cardSiteRow}>
              {favicon ? <img src={favicon} alt="" className={styles.cardSiteIcon} loading="lazy" /> : null}
              <span>{siteLabel}</span>
            </div>
          </a>
          {linkActions(styles.actionBtn)}
        </div>
      </div>
    </div>
  );
};

export default LinkPreviewBlock;
