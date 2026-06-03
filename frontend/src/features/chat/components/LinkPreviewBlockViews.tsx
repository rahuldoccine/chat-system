import { Check, Copy, ExternalLink, Link2, Trash2 } from 'lucide-react';
import { stopPropagationKeyboard } from '../../../utils/a11y';
import styles from './LinkPreviewBlock.module.css';
import { runHandler } from '../../../utils/asyncHandler';
import type { LinkDisplayMode, LinkPreviewMeta } from '../types';

function stopBubble(e: React.MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
}

type LinkPreviewModeProps = Readonly<{
  preview: LinkPreviewMeta;
  wrapClass: string;
  favicon: string | undefined;
  typeLabel: string;
  siteLabel: string;
  cardTitle: string;
  isComposer: boolean;
  isEnriching: boolean;
  linkActions: (btnClass: string) => React.ReactNode;
  moreButton: (buttonClass: string) => React.ReactNode;
}>;

export function LinkPreviewUrlMode({
  preview,
  wrapClass,
  linkActions,
}: Readonly<Pick<LinkPreviewModeProps, 'preview' | 'wrapClass' | 'linkActions'>>) {
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

export function LinkPreviewInlineMode({
  preview,
  wrapClass,
  favicon,
  typeLabel,
  siteLabel,
  isEnriching,
  moreButton,
}: Readonly<
  Pick<
    LinkPreviewModeProps,
    'preview' | 'wrapClass' | 'favicon' | 'typeLabel' | 'siteLabel' | 'isEnriching' | 'moreButton'
  >
>) {
  return (
    <div className={wrapClass}>
      <div className={`${styles.inline} ${isEnriching ? styles.inlineEnriching : ''}`}>
        {favicon ? <img src={favicon} alt="" className={styles.inlineIcon} loading="lazy" /> : null}
        <a
          className={styles.inlineText}
          href={preview.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={stopBubble}
        >
          <span className={styles.inlineMuted}>{typeLabel} </span>
          <span className={styles.inlineBold}>{siteLabel}</span>
        </a>
        {moreButton(styles.inlineMore)}
      </div>
    </div>
  );
}

export function LinkPreviewCardMode({
  preview,
  wrapClass,
  favicon,
  siteLabel,
  cardTitle,
  linkActions,
}: Readonly<
  Pick<
    LinkPreviewModeProps,
    'preview' | 'wrapClass' | 'favicon' | 'siteLabel' | 'cardTitle' | 'linkActions'
  >
>) {
  return (
    <div className={wrapClass}>
      <div className={styles.card}>
        {preview.imageUrl ? (
          <a
            className={styles.cardImageLink}
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stopBubble}
          >
            <img className={styles.cardImage} src={preview.imageUrl} alt="" loading="lazy" />
          </a>
        ) : null}
        <div className={styles.cardBody}>
          <a
            className={styles.cardMain}
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stopBubble}
          >
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
}

export function LinkPreviewMenuPanel({
  menuPanelRef,
  menuPos,
  menuWidth,
  mode,
  onDisplayAsChange,
  closeMenu,
  copyLink,
  openNewTab,
  onRemove,
}: Readonly<{
  menuPanelRef: React.RefObject<HTMLDivElement | null>;
  menuPos: { top: number; left: number } | null;
  menuWidth: number;
  mode: LinkDisplayMode;
  onDisplayAsChange?: (mode: LinkDisplayMode) => void;
  closeMenu: () => void;
  copyLink: () => void;
  openNewTab: () => void;
  onRemove?: () => void;
}>) {
  const options: { id: LinkDisplayMode; label: string }[] = [
    { id: 'inline', label: 'Inline link' },
    { id: 'preview', label: 'Preview' },
    { id: 'url', label: 'URL' },
  ];

  return (
    <div
      ref={menuPanelRef}
      className={styles.menu}
      role="menu"
      tabIndex={-1}
      style={
        menuPos
          ? { position: 'fixed', top: menuPos.top, left: menuPos.left, width: menuWidth, zIndex: 10000 }
          : { position: 'fixed', visibility: 'hidden', width: menuWidth, zIndex: 10000 }
      }
      onClick={stopBubble}
      onMouseDown={stopBubble}
      onKeyDown={stopPropagationKeyboard}
    >
      <div className={styles.menuLabel}>Display as</div>
      {options.map((opt) => (
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
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        onMouseDown={stopBubble}
        onClick={(e) => {
          stopBubble(e);
          runHandler(copyLink);
        }}
      >
        <Copy size={14} className={styles.menuItemIcon} aria-hidden />
        Copy link
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        onMouseDown={stopBubble}
        onClick={(e) => {
          stopBubble(e);
          openNewTab();
        }}
      >
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
  );
}

export function LinkPreviewActionBar({
  isComposer,
  copyLink,
  openNewTab,
  moreButton,
}: Readonly<{
  isComposer: boolean;
  copyLink: () => void;
  openNewTab: () => void;
  moreButton: (buttonClass: string) => React.ReactNode;
}>) {
  const btnClass = styles.actionBtn;
  return (
    <div className={`${styles.linkActions} ${isComposer ? styles.linkActionsVisible : ''}`}>
      <button
        type="button"
        className={btnClass}
        aria-label="Copy link"
        onClick={(e) => {
          stopBubble(e);
          runHandler(copyLink);
        }}
      >
        <Link2 size={15} />
      </button>
      <button
        type="button"
        className={btnClass}
        aria-label="Open in new tab"
        onClick={(e) => {
          stopBubble(e);
          openNewTab();
        }}
      >
        <ExternalLink size={15} />
      </button>
      {moreButton(btnClass)}
    </div>
  );
}
