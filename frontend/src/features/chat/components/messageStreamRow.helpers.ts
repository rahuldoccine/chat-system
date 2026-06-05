import type { Message } from '../types';
import type { DecryptedBody } from '../utils/messageBody';
import { getMessagePreviewText } from '../utils/messagePreview';
import { messageTextWithoutLink } from '../utils/linkPreviewUtils';
import type { MessageKindFlags } from '../utils/messageStream.helpers';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function getThreadBroadcastLabel(
  threadRootId: string | null | undefined,
  messages: Message[] | undefined,
  decryptedBodies: Record<string, DecryptedBody>,
  userId: string | undefined,
): string {
  const root = messages?.find((m) => m.id === threadRootId);
  if (!root) return 'View thread';
  return getMessagePreviewText(root, decryptedBodies, userId);
}

export function buildBubbleClassName(
  styles: Record<string, string>,
  opts: {
    isPinned: boolean;
    isPoll: boolean;
    hasMedia: boolean;
    mediaOnly: boolean;
    groupedWithCaption: boolean;
    singleGroupedFile: boolean;
    usesGroupedFiles: boolean;
    hasCaption: boolean;
    isVoiceNote: boolean;
    isFailed: boolean;
  },
): string {
  const parts = [styles.bubble];
  if (opts.isPinned) parts.push(styles.bubblePinned);
  if (opts.isPoll) parts.push(styles.bubblePoll);
  if (opts.hasMedia && !opts.isPoll) parts.push(styles.bubbleHasMedia);
  if (opts.mediaOnly) parts.push(styles.bubbleMediaOnly);
  if (opts.groupedWithCaption) parts.push(styles.bubbleGroupedWithCaption);
  if (opts.singleGroupedFile) parts.push(styles.bubbleSingleFile);
  if (opts.usesGroupedFiles && !opts.hasCaption) parts.push(styles.bubbleFilesOnly);
  if (opts.isVoiceNote) parts.push(styles.bubbleVoiceNote);
  if (opts.isFailed) parts.push(styles.bubbleFailed);
  return parts.join(' ');
}

export function getDirectReadReceiptStatus(
  isMe: boolean,
  isDirectChat: boolean,
  showReadReceipts: boolean,
  msg: Message,
): 'sent' | 'delivered' | 'read' | undefined {
  if (!isMe || !isDirectChat || !showReadReceipts || msg.status) return undefined;
  return msg.receiptStatus ?? 'sent';
}

export function shouldRenderBodyText(
  hasCaption: boolean,
  usesGroupedFiles: boolean,
  kindFlags: MessageKindFlags,
): boolean {
  return hasCaption && !usesGroupedFiles && !kindFlags.isPoll;
}

export function bodyTextForDisplay(
  displayBody: string,
  linkPreview: { url: string } | null,
): string | null {
  const bodyText = linkPreview
    ? messageTextWithoutLink(displayBody, linkPreview.url)
    : displayBody;
  if (!bodyText?.trim()) return null;
  return bodyText;
}
