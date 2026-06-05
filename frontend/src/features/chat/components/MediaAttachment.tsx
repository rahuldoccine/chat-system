import React from 'react';
import { getMessageFiles, isVoiceMessage, isVideoFile, isAudioFile, shouldUseGroupedFileLayout } from '../utils/fileMeta';
import GroupedFileAttachments from './GroupedFileAttachments';
import VoiceAttachment from './VoiceAttachment';
import VideoAttachment from './VideoAttachment';
import AudioFileAttachment from './AudioFileAttachment';
import SingleImageAttachment from './SingleImageAttachment';
import type { Message } from '../types';

interface MediaAttachmentProps {
  kind: string;
  contentMeta: Message['contentMeta'];
  onMediaLoad?: () => void;
  embedded?: boolean;
  caption?: string;
  bubbleVariant?: 'sent' | 'received';
  mediaTimestamp?: {
    createdAt: string;
    editedAt?: string | null;
    isMe: boolean;
    receiptStatus?: 'sent' | 'delivered' | 'read';
  };
}

const MediaAttachment: React.FC<MediaAttachmentProps> = ({
  kind,
  contentMeta,
  onMediaLoad,
  embedded = false,
  caption,
  bubbleVariant = 'received',
  mediaTimestamp,
}) => {
  const messageRef = { kind: kind as Message['kind'], contentMeta };

  if (isVoiceMessage(messageRef)) {
    return (
      <VoiceAttachment
        contentMeta={contentMeta}
        bubbleVariant={bubbleVariant}
        mediaTimestamp={mediaTimestamp}
      />
    );
  }

  const files = getMessageFiles(messageRef);

  if (files?.length === 1 && isVideoFile(files[0])) {
    return (
      <VideoAttachment
        contentMeta={contentMeta}
        embedded={embedded}
        bubbleVariant={bubbleVariant}
        onMediaLoad={onMediaLoad}
        mediaTimestamp={mediaTimestamp}
      />
    );
  }

  if (files?.length === 1 && isAudioFile(files[0])) {
    return (
      <AudioFileAttachment
        contentMeta={contentMeta}
        bubbleVariant={bubbleVariant}
        mediaTimestamp={mediaTimestamp}
      />
    );
  }

  if (files && shouldUseGroupedFileLayout(messageRef)) {
    return (
      <GroupedFileAttachments
        files={files}
        contentMeta={contentMeta}
        embedded={embedded}
        caption={caption}
        bubbleVariant={bubbleVariant}
        mediaTimestamp={mediaTimestamp}
      />
    );
  }

  return (
    <SingleImageAttachment
      contentMeta={contentMeta}
      onMediaLoad={onMediaLoad}
      embedded={embedded}
      primaryFile={files?.[0]}
      mediaTimestamp={mediaTimestamp}
    />
  );
};

export default MediaAttachment;
