import React from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import styles from './LinkPreviewBlock.module.css';
import type { LinkDisplayMode, LinkPreviewMeta } from '../types';
import {
  faviconUrlForLink,
  inlineLinkTypeLabel,
  inlineSiteLabel,
  linkDisplayMode,
} from '../utils/linkPreviewUtils';
import { LINK_PREVIEW_MENU_WIDTH, useLinkPreviewMenu } from './useLinkPreviewMenu';
import {
  LinkPreviewActionBar,
  LinkPreviewCardMode,
  LinkPreviewInlineMode,
  LinkPreviewMenuPanel,
  LinkPreviewUrlMode,
} from './LinkPreviewBlockViews';

export type LinkPreviewBlockProps = {
  preview: LinkPreviewMeta;
  displayAs?: LinkDisplayMode;
  isEnriching?: boolean;
  onRemove?: () => void;
  onDisplayAsChange?: (mode: LinkDisplayMode) => void;
  variant?: 'message' | 'composer';
  bubbleVariant?: 'sent' | 'received';
};

function stopBubble(e: React.MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
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
  const { menuOpen, setMenuOpen, menuPos, menuTriggerRef, menuPanelRef, closeMenu, openMenuAtTrigger } =
    useLinkPreviewMenu(mode);

  const favicon = faviconUrlForLink(preview.url);
  const typeLabel = inlineLinkTypeLabel(preview);
  const siteLabel = inlineSiteLabel(preview);
  const cardTitle = preview.title?.trim() || typeLabel;

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
    globalThis.open(preview.url, '_blank', 'noopener,noreferrer');
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
    <LinkPreviewMenuPanel
      menuPanelRef={menuPanelRef}
      menuPos={menuPos}
      menuWidth={LINK_PREVIEW_MENU_WIDTH}
      mode={mode}
      onDisplayAsChange={onDisplayAsChange}
      closeMenu={closeMenu}
      copyLink={copyLink}
      openNewTab={openNewTab}
      onRemove={onRemove}
    />
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
          if (menuOpen) {
            setMenuOpen(false);
            closeMenu();
          } else {
            openMenuAtTrigger(e.currentTarget);
          }
        }}
      >
        <MoreHorizontal size={buttonClass === styles.inlineMore ? 14 : 16} />
      </button>
      {menuPortal}
    </>
  );

  const linkActions = (btnClass: string) => (
    <LinkPreviewActionBar
      isComposer={isComposer}
      copyLink={copyLink}
      openNewTab={openNewTab}
      moreButton={() => moreButton(btnClass)}
    />
  );

  const modeProps = {
    preview,
    wrapClass,
    favicon,
    typeLabel,
    siteLabel,
    cardTitle,
    isComposer,
    isEnriching,
    linkActions,
    moreButton,
  };

  if (mode === 'url') {
    return <LinkPreviewUrlMode preview={preview} wrapClass={wrapClass} linkActions={linkActions} />;
  }
  if (mode === 'inline') {
    return <LinkPreviewInlineMode {...modeProps} />;
  }
  return <LinkPreviewCardMode {...modeProps} />;
};

export default LinkPreviewBlock;
