import { useCallback, type RefObject } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { debounce } from 'lodash-es';
import { env } from '../../../config/env';
import {
  applyMentionToText,
  buildTextAfterPaste,
  getMentionKeyAction,
  insertEmojiInText,
  mergeAttachmentsWithinLimit,
  nextMentionIndex,
  partitionFilesByExtension,
  partitionFilesBySize,
  prefetchPastedLinkPreview,
  shouldHandlePasteLinkPreview,
  tooLargeFilesMessage,
} from './messageComposer.helpers';
import { extractFirstHttpUrl } from '../utils/linkPreviewUtils';

export type ComposerInputParams = {
  text: string;
  setText: (t: string) => void;
  activeId: string | null;
  editingMessage: { id: string; text: string } | null;
  isThread: boolean;
  threadDraftKey: string | null;
  setDraft: (id: string, text: string) => void;
  setThreadDraft: (key: string, text: string) => void;
  attachmentsLength: number;
  setPreviewDismissed: (v: boolean) => void;
  queryClient: QueryClient;
  inputRef: RefObject<HTMLInputElement | null>;
  mentionOpen: boolean;
  mentionCandidates: { handle: string }[];
  mentionIndex: number;
  setMentionIndex: (fn: (i: number) => number) => void;
  setMentionOpen: (v: boolean) => void;
  showAlert: (title: string, description: string) => void;
  setAttachments: React.Dispatch<React.SetStateAction<File[]>>;
  socket: { sendTyping: (chatId: string, typing: boolean) => void };
  onSend: () => void;
};

export function useMessageComposerInput(p: ComposerInputParams) {
  const debouncedStopTyping = useCallback(
    debounce((chatId: string) => {
      p.socket.sendTyping(chatId, false);
    }, 2000),
    [p.socket],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    p.setText(val);
    if (p.activeId && !p.editingMessage) {
      if (p.isThread && p.threadDraftKey) {
        p.setThreadDraft(p.threadDraftKey, val);
      } else {
        p.setDraft(p.activeId, val);
      }
      p.socket.sendTyping(p.activeId, true);
      debouncedStopTyping(p.activeId);
    }
  };

  const applyMention = (handle: string) => {
    const next = applyMentionToText(p.text, handle);
    p.setText(next);
    if (p.activeId && !p.editingMessage) {
      if (p.isThread && p.threadDraftKey) p.setThreadDraft(p.threadDraftKey, next);
      else p.setDraft(p.activeId, next);
    }
    p.setMentionOpen(false);
    requestAnimationFrame(() => p.inputRef.current?.focus());
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    const input = e.currentTarget;
    const start = input.selectionStart ?? p.text.length;
    const end = input.selectionEnd ?? p.text.length;
    const pasteParams = {
      editingMessage: p.editingMessage,
      attachmentsLength: p.attachmentsLength,
      text: p.text,
      pasted,
      selectionStart: start,
      selectionEnd: end,
    };
    if (!shouldHandlePasteLinkPreview(pasteParams)) return;

    const newText = buildTextAfterPaste(pasteParams);
    const urlInPasted = extractFirstHttpUrl(newText) ?? extractFirstHttpUrl(pasted);
    if (!urlInPasted) return;

    e.preventDefault();
    p.setText(newText);
    if (p.activeId) {
      p.setDraft(p.activeId, newText);
    }
    p.setPreviewDismissed(false);
    prefetchPastedLinkPreview(p.queryClient, urlInPasted);
  };

  const handleEmojiClick = (emojiObject: { emoji: string }) => {
    const input = p.inputRef.current;
    const { newText, cursorPos } = insertEmojiInText(
      p.text,
      emojiObject.emoji,
      input?.selectionStart ?? null,
      input?.selectionEnd ?? null,
    );
    p.setText(newText);
    if (p.activeId && !p.editingMessage) {
      p.setDraft(p.activeId, newText);
    }
    if (cursorPos !== null) {
      setTimeout(() => {
        const el = p.inputRef.current;
        if (!el) return;
        el.selectionStart = cursorPos;
        el.selectionEnd = cursorPos;
        el.focus();
      }, 0);
    }
  };

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const picked = Array.from(incoming);
      if (picked.length === 0) return;

      const { valid, invalidNames } = partitionFilesByExtension(picked);

      if (invalidNames.length > 0) {
        p.showAlert(
          'Invalid file format',
          `${invalidNames.join(', ')} cannot be attached. Allowed: ${env.allowedFileExtensions.join(', ')}`,
        );
      }

      if (valid.length === 0) return;

      const { allowed, tooLarge } = partitionFilesBySize(valid);

      if (tooLarge.length > 0) {
        p.showAlert('File too large', tooLargeFilesMessage(tooLarge));
      }

      if (allowed.length === 0) return;

      p.setAttachments((prev) => mergeAttachmentsWithinLimit(prev, allowed, p.showAlert));
    },
    [p],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const mentionAction = getMentionKeyAction(
      e.key,
      p.mentionOpen,
      p.mentionCandidates,
      p.mentionIndex,
    );
    if (mentionAction.type !== 'none') {
      e.preventDefault();
      if (mentionAction.type === 'down') {
        p.setMentionIndex((i) => nextMentionIndex(i, 'down', p.mentionCandidates.length));
        return;
      }
      if (mentionAction.type === 'up') {
        p.setMentionIndex((i) => nextMentionIndex(i, 'up', p.mentionCandidates.length));
        return;
      }
      if (mentionAction.type === 'enter') {
        applyMention(mentionAction.handle);
        return;
      }
      p.setMentionOpen(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      p.onSend();
    }
  };

  return {
    handleChange,
    handlePaste,
    handleEmojiClick,
    addFiles,
    handleKeyDown,
    applyMention,
  };
}
