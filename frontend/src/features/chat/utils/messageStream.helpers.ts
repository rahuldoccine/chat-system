import type { Message } from '../types';
import { getMessageFiles, isVoiceMessage, shouldUseGroupedFileLayout } from './fileMeta';
import { getCallFromMessageMeta } from '../../calls/components/CallMessageBubble';
import { getCallTranscriptFromMeta } from '../../calls/components/CallTranscriptBubble';
import { getGroupActivityFromMeta } from '../components/GroupActivityBubble';

export function formatThreadLastReply(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `today at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatNewMessagesLabel(count: number): string {
  if (count === 1) return '1 new message';
  const capped = count > 99 ? '99+' : count;
  return `${capped} new messages`;
}

export function formatNewMessagesBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export function formatThreadReplySummary(
  replyCount: number,
  lastReplyAt?: string | null,
): string {
  const countLabel = replyCount === 1 ? '1 reply' : `${replyCount} replies`;
  if (!lastReplyAt) return countLabel;
  return `${countLabel} · Last reply ${formatThreadLastReply(lastReplyAt)}`;
}

export type EmptyStateCopy = {
  title: string;
  subtitle: string;
};

export function getEmptyStateCopy(
  chatType: string | undefined,
  chatName: string,
): EmptyStateCopy {
  if (chatType === 'GROUP') {
    return {
      title: `Welcome to #${chatName}`,
      subtitle: 'Be the first to say something and get the conversation going.',
    };
  }
  return {
    title: `This is the beginning of your chat with ${chatName}`,
    subtitle: 'Send a message to break the ice. Your conversation is private between you two.',
  };
}

export type MessageKindFlags = {
  isPoll: boolean;
  isGroupActivity: boolean;
  isCallSystem: boolean;
  isCallTranscript: boolean;
  callMeta: ReturnType<typeof getCallFromMessageMeta>;
  transcriptMeta: ReturnType<typeof getCallTranscriptFromMeta>;
  groupActivityMeta: ReturnType<typeof getGroupActivityFromMeta>;
};

export function getMessageKindFlags(msg: Message): MessageKindFlags {
  const callMeta = getCallFromMessageMeta(msg.contentMeta);
  const transcriptMeta = getCallTranscriptFromMeta(msg.contentMeta);
  const groupActivityMeta = getGroupActivityFromMeta(msg.contentMeta);
  const isPoll = msg.kind === 'POLL' && Boolean(msg.contentMeta?.pollId);
  const isGroupActivity = msg.kind === 'SYSTEM' && Boolean(groupActivityMeta) && !callMeta;
  const isCallSystem = msg.kind === 'SYSTEM' && Boolean(callMeta);
  const isCallTranscript = msg.kind === 'SYSTEM' && Boolean(transcriptMeta);

  return {
    isPoll,
    isGroupActivity,
    isCallSystem,
    isCallTranscript,
    callMeta,
    transcriptMeta,
    groupActivityMeta,
  };
}

export type MessageMediaLayout = {
  messageFiles: ReturnType<typeof getMessageFiles>;
  hasMedia: boolean;
  hasCaption: boolean;
  usesGroupedFiles: boolean;
  groupedWithCaption: boolean;
  singleGroupedFile: boolean;
  wideMediaLayout: boolean;
  compactMediaLayout: boolean;
  isVoiceNote: boolean;
  showMediaTimestamp: boolean;
  mediaOnly: boolean;
};

export function computeMessageMediaLayout(
  displayMsg: Message,
  displayBody: string,
): MessageMediaLayout {
  const messageFiles = getMessageFiles(displayMsg);
  const hasMedia = Boolean(messageFiles?.length);
  const hasCaption = Boolean(displayBody?.trim());
  const usesGroupedFiles = hasMedia && shouldUseGroupedFileLayout(displayMsg);
  const groupedWithCaption = usesGroupedFiles && hasCaption;
  const singleGroupedFile = usesGroupedFiles && messageFiles?.length === 1;
  const wideMediaLayout =
    hasMedia &&
    usesGroupedFiles &&
    Boolean(messageFiles && (messageFiles.length > 1 || groupedWithCaption));
  const compactMediaLayout = hasMedia && !wideMediaLayout;
  const isVoiceNote = isVoiceMessage(displayMsg);
  const showMediaTimestamp = hasMedia && !hasCaption;
  const mediaOnly = showMediaTimestamp && !usesGroupedFiles;

  return {
    messageFiles,
    hasMedia,
    hasCaption,
    usesGroupedFiles,
    groupedWithCaption,
    singleGroupedFile,
    wideMediaLayout,
    compactMediaLayout,
    isVoiceNote,
    showMediaTimestamp,
    mediaOnly,
  };
}
