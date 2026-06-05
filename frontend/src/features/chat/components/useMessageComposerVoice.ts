import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { VOICE_MIN_MS } from '../hooks/useVoiceRecorder';
import type { useVoiceRecorder } from '../hooks/useVoiceRecorder';

type VoiceRecorder = ReturnType<typeof useVoiceRecorder>;

export type VoiceComposerParams = {
  activeId: string | null;
  editingMessage: { id: string; text: string } | null;
  uploadStatus: string;
  isSending: boolean;
  isSavingEdit: boolean;
  isThread: boolean;
  replyingTo: string | null;
  sendCtx: Record<string, unknown>;
  threadSendMeta: Record<string, unknown>;
  voice: VoiceRecorder;
  uploadForChat: (
    file: File,
    options?: { voiceNote?: boolean },
  ) => Promise<{
    uploadResult: { ok: boolean; message?: string; data?: { id: string; filename: string; size: number; url: string } };
  }>;
  sendMessageAsync: (args: unknown) => Promise<unknown>;
  scrollToBottom: () => void;
  setReplyingTo: (id: string | null) => void;
  setShowEmojiPicker: (v: boolean) => void;
  setShowPlusMenu: (v: boolean) => void;
  setUploadProgress: (v: { current: number; total: number } | null) => void;
  resetUpload: () => void;
  socket: { sendTyping: (chatId: string, typing: boolean) => void };
};

export function useMessageComposerVoice(p: VoiceComposerParams) {
  const micPointerActiveRef = useRef(false);

  const sendVoiceNote = useCallback(
    async (result: { blob: Blob; mimeType: string; durationMs: number }) => {
      if (!p.activeId) return;
      if (result.durationMs < VOICE_MIN_MS) {
        toast.error('Hold the button longer to record a voice message');
        return;
      }

      const file = p.voice.toVoiceFile(result);
      try {
        p.setUploadProgress({ current: 1, total: 1 });
        const { uploadResult } = await p.uploadForChat(file, { voiceNote: true });
        if (!uploadResult.ok || !uploadResult.data) {
          toast.error(uploadResult.message ?? 'Upload failed');
          return;
        }
        const uploaded = uploadResult.data;
        const voiceFile = {
          uploadId: uploaded.id,
          filename: uploaded.filename,
          originalName: 'Voice message',
          mimetype: result.mimeType || 'audio/webm',
          size: uploaded.size,
          url: uploaded.url,
        };

        await p.sendMessageAsync({
          chatId: p.activeId,
          text: '',
          replyToId: p.isThread ? undefined : p.replyingTo || undefined,
          kind: 'FILE',
          ...p.sendCtx,
          ...p.threadSendMeta,
          contentMeta: {
            voiceNote: true,
            durationMs: result.durationMs,
            files: [voiceFile],
            ...voiceFile,
          },
        });

        p.scrollToBottom();
        p.setReplyingTo(null);
        p.setShowEmojiPicker(false);
        p.setShowPlusMenu(false);
        p.socket.sendTyping(p.activeId, false);
      } catch {
        toast.error("We couldn't send your voice message. Please try again.");
      } finally {
        p.setUploadProgress(null);
        p.resetUpload();
      }
    },
    [p],
  );

  const handleMicPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!p.activeId || p.editingMessage || p.uploadStatus === 'uploading' || p.isSending || p.isSavingEdit) {
        return;
      }
      e.preventDefault();
      micPointerActiveRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      void p.voice.start();
    },
    [p],
  );

  const handleMicPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!micPointerActiveRef.current) return;
      micPointerActiveRef.current = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (!p.voice.isRecording) return;

      void p.voice.stop().then((result) => {
        if (result) {
          void sendVoiceNote(result);
        }
      });
    },
    [p.voice, sendVoiceNote],
  );

  const handleMicPointerLeave = useCallback(() => {
    if (!micPointerActiveRef.current || !p.voice.isRecording) return;
    micPointerActiveRef.current = false;
    p.voice.cancel();
    toast.message('Recording cancelled');
  }, [p.voice]);

  const cancelRecording = useCallback(() => {
    micPointerActiveRef.current = false;
    p.voice.cancel();
  }, [p.voice]);

  return {
    micPointerActiveRef,
    handleMicPointerDown,
    handleMicPointerUp,
    handleMicPointerLeave,
    cancelRecording,
  };
}
