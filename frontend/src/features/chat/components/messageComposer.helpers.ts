import type { QueryClient } from '@tanstack/react-query';
import { env } from '../../../config/env';
import { fileTooLargeMessage, isFileTooLarge } from '../utils/uploadErrors';
import {
  extractFirstHttpUrl,
  instantPreviewFromUrl,
} from '../utils/linkPreviewUtils';
import { linkPreviewQueryKey } from '../hooks/useLinkPreview';
import { fetchLinkPreviewWithFallback } from '../hooks/fetchLinkPreview';

export type ComposerAlert = {
  title: string;
  description: string;
};

export type MentionCandidate = { handle: string };

export function isAllowedComposerFile(file: File): boolean {
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  return env.allowedFileExtensions.includes(ext);
}

export type PartitionedFiles = {
  valid: File[];
  invalidNames: string[];
};

export function partitionFilesByExtension(files: File[]): PartitionedFiles {
  const valid: File[] = [];
  const invalidNames: string[] = [];
  for (const file of files) {
    if (isAllowedComposerFile(file)) valid.push(file);
    else invalidNames.push(file.name);
  }
  return { valid, invalidNames };
}

export function partitionFilesBySize(files: File[]): { allowed: File[]; tooLarge: string[] } {
  const allowed: File[] = [];
  const tooLarge: string[] = [];
  for (const file of files) {
    if (isFileTooLarge(file)) tooLarge.push(file.name);
    else allowed.push(file);
  }
  return { allowed, tooLarge };
}

export function tooLargeFilesMessage(tooLarge: string[]): string {
  if (tooLarge.length === 1) {
    return fileTooLargeMessage(tooLarge[0] ?? 'File');
  }
  return `${tooLarge.join(', ')} exceed the ${env.maxUploadMb} MB upload limit.`;
}

export function mergeAttachmentsWithinLimit(
  prev: File[],
  allowed: File[],
  showAlert: (title: string, description: string) => void,
): File[] {
  const slotsLeft = env.maxAttachments - prev.length;
  if (slotsLeft <= 0) {
    showAlert(
      'Attachment limit',
      `You can attach up to ${env.maxAttachments} files at a time.`,
    );
    return prev;
  }

  const toAdd = allowed.slice(0, slotsLeft);
  if (toAdd.length < allowed.length) {
    showAlert(
      'Attachment limit',
      `Only ${env.maxAttachments} files allowed. Added ${toAdd.length} of ${allowed.length} selected.`,
    );
  }

  return [...prev, ...toAdd];
}

export type MentionKeyAction =
  | { type: 'none' }
  | { type: 'down' }
  | { type: 'up' }
  | { type: 'enter'; handle: string }
  | { type: 'escape' };

export function getMentionKeyAction(
  key: string,
  mentionOpen: boolean,
  mentionCandidates: MentionCandidate[],
  mentionIndex: number,
): MentionKeyAction {
  if (!mentionOpen || mentionCandidates.length === 0) {
    return { type: 'none' };
  }
  if (key === 'ArrowDown') return { type: 'down' };
  if (key === 'ArrowUp') return { type: 'up' };
  if (key === 'Escape') return { type: 'escape' };
  if (key === 'Enter') {
    const picked = mentionCandidates[mentionIndex];
    if (picked) return { type: 'enter', handle: picked.handle };
  }
  return { type: 'none' };
}

export function nextMentionIndex(
  current: number,
  direction: 'up' | 'down',
  count: number,
): number {
  if (direction === 'down') return Math.min(current + 1, count - 1);
  return Math.max(current - 1, 0);
}

export function applyMentionToText(text: string, handle: string): string {
  return text.replaceAll(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/g, (m) =>
    m.replaceAll(/@([a-zA-Z0-9_.-]*)$/g, `@${handle} `),
  );
}

export type PasteLinkPreviewParams = {
  editingMessage: unknown;
  attachmentsLength: number;
  text: string;
  pasted: string;
  selectionStart: number;
  selectionEnd: number;
};

export function buildTextAfterPaste(params: PasteLinkPreviewParams): string {
  const { text, pasted, selectionStart, selectionEnd } = params;
  return text.slice(0, selectionStart) + pasted + text.slice(selectionEnd);
}

export function shouldHandlePasteLinkPreview(params: PasteLinkPreviewParams): boolean {
  if (params.editingMessage || params.attachmentsLength > 0) return false;
  if (!params.pasted) return false;
  const newText = buildTextAfterPaste(params);
  const url = extractFirstHttpUrl(newText) ?? extractFirstHttpUrl(params.pasted);
  return Boolean(url);
}

export function prefetchPastedLinkPreview(
  queryClient: QueryClient,
  url: string,
): void {
  queryClient.setQueryData(linkPreviewQueryKey(url), {
    preview: instantPreviewFromUrl(url),
  });
  void queryClient.prefetchQuery({
    queryKey: linkPreviewQueryKey(url),
    queryFn: () => fetchLinkPreviewWithFallback(url),
    staleTime: 60_000,
  });
}

export function insertEmojiInText(
  text: string,
  emoji: string,
  selectionStart: number | null,
  selectionEnd: number | null,
): { newText: string; cursorPos: number | null } {
  if (selectionStart !== null && selectionEnd !== null) {
    const start = selectionStart;
    const end = selectionEnd;
    const newText = text.substring(0, start) + emoji + text.substring(end);
    return { newText, cursorPos: start + emoji.length };
  }
  return { newText: text + emoji, cursorPos: null };
}

export function composerKeyboardInset(): number {
  const vv = globalThis.visualViewport;
  if (!vv) return 0;
  const inset = Math.max(0, globalThis.innerHeight - vv.height - vv.offsetTop);
  return inset > 50 ? inset : 0;
}

export function isSendDisabled(
  editingMessage: { id: string; text: string } | null,
  text: string,
  attachmentsLength: number,
  isSending: boolean,
  isSavingEdit: boolean,
  voiceBusy: boolean,
): boolean {
  const emptySend = !editingMessage && !text.trim() && attachmentsLength === 0;
  return emptySend || isSending || isSavingEdit || voiceBusy;
}

export function canSendComposerMessage(params: {
  activeId: string | null | undefined;
  isThread: boolean;
  threadRootId: string | undefined;
  isSending: boolean;
  isSavingEdit: boolean;
  uploadStatus: string;
  isRecording: boolean;
}): boolean {
  if (!params.activeId) return false;
  if (params.isThread && !params.threadRootId) return false;
  if (params.isSending || params.isSavingEdit) return false;
  if (params.uploadStatus === 'uploading') return false;
  if (params.isRecording) return false;
  return true;
}

export function shouldShowComposerLinkPreview(
  composerPreview: unknown,
  editingMessage: unknown,
  attachmentsLength: number,
): boolean {
  return Boolean(composerPreview && !editingMessage && attachmentsLength === 0);
}

export function isSendButtonActive(
  editingMessage: { id: string; text: string } | null,
  text: string,
  attachmentsLength: number,
  isSending: boolean,
  isSavingEdit: boolean,
  voiceBusy: boolean,
): boolean {
  const hasContent = Boolean(editingMessage || text.trim() || attachmentsLength > 0);
  return hasContent && !isSending && !isSavingEdit && !voiceBusy;
}
