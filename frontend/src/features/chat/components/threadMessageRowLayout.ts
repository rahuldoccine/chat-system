import type { Message } from '../types';
import { getMessageFiles, shouldUseGroupedFileLayout } from '../utils/fileMeta';

export function computeThreadMessageLayout(
  displayMsg: Message,
  text: string,
): {
  hasMedia: boolean;
  usesGroupedFiles: boolean;
  groupedWithCaption: boolean;
  showCaptionText: boolean;
  shrinkMediaBubble: boolean;
  mediaOnly: boolean;
} {
  const files = getMessageFiles(displayMsg);
  const hasMedia = Boolean(files?.length);
  const usesGroupedFiles = hasMedia && shouldUseGroupedFileLayout(displayMsg);
  const groupedWithCaption = usesGroupedFiles && Boolean(text?.trim());
  const showCaptionText = Boolean(text?.trim()) && !usesGroupedFiles;
  const shrinkMediaBubble = hasMedia && !usesGroupedFiles;
  const mediaOnly = shrinkMediaBubble && !text?.trim() && !groupedWithCaption;
  return {
    hasMedia,
    usesGroupedFiles,
    groupedWithCaption,
    showCaptionText,
    shrinkMediaBubble,
    mediaOnly,
  };
}
