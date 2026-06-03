import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { getAvatarImageSrc, resolveLiveAvatarUrl } from '../../settings/utils/avatarUrl';
import { useLiveDisplayName } from '../../settings/hooks/useLiveDisplayName';
import styles from './UserAvatar.module.css';

export type UserAvatarProps = Readonly<{
  userId?: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  email?: string;
  className?: string;
  fallbackClassName?: string;
  style?: React.CSSProperties;
  /** Font size for initials fallback (e.g. "1rem" in headers, "0.65rem" in compact lists). */
  fallbackFontSize?: string;
}>;

/**
 * Renders profile image or initials fallback. For the signed-in user, prefers live AuthContext avatar.
 * Falls back to initials when there is no URL or the image fails to load (404 / deleted file).
 */
const UserAvatar: React.FC<UserAvatarProps> = ({
  userId,
  avatarUrl,
  displayName,
  email,
  className,
  fallbackClassName,
  style,
  fallbackFontSize,
}) => {
  const { user, token } = useAuth();
  const [imageFailed, setImageFailed] = useState(false);

  const resolvedUrl = resolveLiveAvatarUrl(userId, user?.id, user?.avatar, avatarUrl);

  const src = getAvatarImageSrc(resolvedUrl, token);
  const label = useLiveDisplayName(userId, displayName, email);
  const initial = (label.charAt(0) || '?').toUpperCase();

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  const showImage = Boolean(src) && !imageFailed;
  const rootClass = [styles.root, className].filter(Boolean).join(' ');
  const fallbackInnerClass = [styles.fallback, fallbackClassName].filter(Boolean).join(' ');

  if (showImage && src) {
    return (
      <span className={rootClass} style={style} aria-hidden>
        <img
          src={src}
          alt=""
          className={styles.image}
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  return (
    <span className={rootClass} style={style} aria-hidden>
      <span
        className={fallbackInnerClass}
        style={fallbackFontSize ? { fontSize: fallbackFontSize } : undefined}
      >
        {initial}
      </span>
    </span>
  );
};

export default UserAvatar;
