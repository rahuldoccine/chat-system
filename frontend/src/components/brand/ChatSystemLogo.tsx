import React, { useId } from 'react';
import styles from './ChatSystemLogo.module.css';
import { LOGO_MARK_VIEWBOX, LogoMarkDefs, LogoMarkShapes } from './logoMark.svg';

export type ChatSystemLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type ChatSystemLogoVariant = 'mark' | 'full' | 'stacked';
export type ChatSystemLogoTheme = 'dark' | 'light';

const MARK_PX: Record<ChatSystemLogoSize, number> = {
  xs: 28,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 72,
};

export type ChatSystemLogoProps = {
  variant?: ChatSystemLogoVariant;
  size?: ChatSystemLogoSize;
  theme?: ChatSystemLogoTheme;
  className?: string;
  showSubtitle?: boolean;
  glow?: boolean;
  animated?: boolean;
  'aria-label'?: string;
};

const ChatSystemLogo: React.FC<ChatSystemLogoProps> = ({
  variant = 'full',
  size = 'md',
  theme = 'dark',
  className,
  showSubtitle = true,
  glow = false,
  animated = false,
  'aria-label': ariaLabel = 'Chat System',
}) => {
  const uid = useId().replaceAll(':', '');
  const idPrefix = `cs${uid}`;
  const px = MARK_PX[size];
  const sizeClass = styles[`size${size.charAt(0).toUpperCase()}${size.slice(1)}` as keyof typeof styles];

  const markSvg = (
    <svg
      className={[styles.mark, animated ? styles.markPulse : ''].filter(Boolean).join(' ')}
      width={px}
      height={px}
      viewBox={LOGO_MARK_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={variant !== 'mark'}
      role={variant === 'mark' ? 'img' : undefined}
      aria-label={variant === 'mark' ? ariaLabel : undefined}
    >
      <LogoMarkDefs idPrefix={idPrefix} />
      <LogoMarkShapes idPrefix={idPrefix} />
    </svg>
  );

  const mark = glow ? <span className={styles.markWrap}>{markSvg}</span> : markSvg;

  if (variant === 'mark') {
    return <span className={className}>{mark}</span>;
  }

  const accentClass = theme === 'light' ? styles.titleAccentLight : styles.titleAccent;
  const mutedClass = theme === 'light' ? styles.titleMutedLight : styles.titleMuted;
  const subtitleClass = theme === 'light' ? styles.subtitleLight : styles.subtitle;

  return (
    <div
      className={[
        styles.root,
        variant === 'stacked' ? styles.stacked : '',
        sizeClass,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel}
      role="img"
    >
      {mark}
      <div className={styles.wordmark}>
        <span className={styles.titleRow}>
          <span className={accentClass}>Chat</span>
          <span className={mutedClass}>System</span>
        </span>
        {showSubtitle && variant === 'stacked' ? (
          <span className={subtitleClass}>Secure messaging</span>
        ) : null}
      </div>
    </div>
  );
};

export default ChatSystemLogo;
