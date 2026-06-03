import { useEffect, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { composerKeyboardInset } from './messageComposer.helpers';

type ComposerEffectsParams = {
  urlInText: string | null | undefined;
  setPreviewDismissed: (v: boolean) => void;
  setLinkDisplayAs: (mode: 'inline' | 'preview' | 'url') => void;
  editingMessage: { id: string; text: string } | null;
  setText: (t: string) => void;
  setAttachments: (files: File[]) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  activeId: string | null;
  drafts: Record<string, string>;
  threadDrafts: Record<string, string>;
  threadDraftKey: string | null;
  isThread: boolean;
  voiceError: string | null | undefined;
  voiceState: string;
  showEmojiPicker: boolean;
  showPlusMenu: boolean;
  showGifPicker: boolean;
  mentionOpen: boolean;
  setShowEmojiPicker: (v: boolean) => void;
  setShowPlusMenu: (v: boolean) => void;
  setShowGifPicker: (v: boolean) => void;
  setMentionOpen: (v: boolean) => void;
  setMentionIndex: (index: number) => void;
  emojiPickerRef: RefObject<HTMLDivElement | null>;
  plusMenuRef: RefObject<HTMLDivElement | null>;
  mentionMenuRef: RefObject<HTMLDivElement | null>;
  mentionCandidatesLength: number;
};

export function useMessageComposerEffects(p: ComposerEffectsParams): number {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (!p.urlInText) {
      p.setPreviewDismissed(false);
      p.setLinkDisplayAs('inline');
    }
  }, [p.urlInText, p.setPreviewDismissed, p.setLinkDisplayAs]);

  useEffect(() => {
    if (p.editingMessage) {
      p.setText(p.editingMessage.text);
      p.setAttachments([]);
      p.inputRef.current?.focus();
    }
  }, [p.editingMessage, p.setText, p.setAttachments, p.inputRef]);

  useEffect(() => {
    if (!p.editingMessage) {
      if (p.isThread && p.threadDraftKey) {
        p.setText(p.threadDrafts[p.threadDraftKey] || '');
      } else {
        p.setText(p.activeId ? p.drafts[p.activeId] || '' : '');
      }
    }
  }, [
    p.activeId,
    p.drafts,
    p.threadDrafts,
    p.threadDraftKey,
    p.editingMessage,
    p.isThread,
    p.setText,
  ]);

  useEffect(() => {
    if (p.voiceError && p.voiceState === 'error') {
      toast.error(p.voiceError);
    }
  }, [p.voiceError, p.voiceState]);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (p.showEmojiPicker && p.emojiPickerRef.current && !p.emojiPickerRef.current.contains(target)) {
        p.setShowEmojiPicker(false);
      }
      if (
        (p.showPlusMenu || p.showGifPicker) &&
        p.plusMenuRef.current &&
        !p.plusMenuRef.current.contains(target)
      ) {
        p.setShowPlusMenu(false);
        p.setShowGifPicker(false);
      }
      if (p.mentionOpen && p.mentionMenuRef.current && !p.mentionMenuRef.current.contains(target)) {
        p.setMentionOpen(false);
      }
    };
    if (!p.showEmojiPicker && !p.showPlusMenu && !p.showGifPicker && !p.mentionOpen) return;
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [
    p.showEmojiPicker,
    p.showPlusMenu,
    p.showGifPicker,
    p.mentionOpen,
    p.emojiPickerRef,
    p.plusMenuRef,
    p.mentionMenuRef,
    p.setShowEmojiPicker,
    p.setShowPlusMenu,
    p.setShowGifPicker,
    p.setMentionOpen,
  ]);

  useEffect(() => {
    p.setMentionOpen(p.mentionCandidatesLength > 0);
    p.setMentionIndex(0);
  }, [p.mentionCandidatesLength, p.setMentionOpen, p.setMentionIndex]);

  useEffect(() => {
    const vv = globalThis.visualViewport;
    if (!vv) return;

    const update = () => setKeyboardInset(composerKeyboardInset());

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return keyboardInset;
}
