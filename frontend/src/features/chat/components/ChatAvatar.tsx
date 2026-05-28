import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { getAvatarImageSrc } from '../../settings/utils/avatarUrl';
import type { Chat } from '../types';
import styles from './ChatAvatar.module.css';

type ChatAvatarProps = {
  chat: Chat;
  chatName: string;
  size?: number;
  borderRadius?: number | string;
  className?: string;
  fallbackFontSize?: string;
};

const ChatAvatar: React.FC<ChatAvatarProps> = ({
  chat,
  chatName,
  size = 40,
  borderRadius = 12,
  className,
  fallbackFontSize = '1rem',
}) => {
  const { token } = useAuth();
  const [imageFailed, setImageFailed] = useState(false);
  const avatarUrl = chat.type === 'GROUP' ? chat.avatarUrl : chat.dmPeer?.avatarUrl;
  const src = getAvatarImageSrc(avatarUrl, token);
  const initial = chatName.charAt(0).toUpperCase();
  const showImage = Boolean(src) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl, chat.id]);

  const dimension = { width: size, height: size, borderRadius };

  if (showImage && src) {
    return (
      <img
        src={src}
        alt=""
        className={`${styles.image} ${className ?? ''}`}
        style={dimension}
        onError={() => setImageFailed(true)}
      />
    );
  }

  if (chat.type === 'GROUP') {
    return (
      <div
        className={`${styles.fallback} ${styles.groupFallback} ${className ?? ''}`}
        style={dimension}
        aria-hidden
      >
        <Users size={Math.round(size * 0.5)} strokeWidth={2.2} />
      </div>
    );
  }

  return (
    <div
      className={`${styles.fallback} ${styles.dmFallback} ${className ?? ''}`}
      style={dimension}
      aria-hidden
    >
      <span style={{ fontSize: fallbackFontSize }}>{initial}</span>
    </div>
  );
};

export default ChatAvatar;
