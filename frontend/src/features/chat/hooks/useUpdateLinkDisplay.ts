import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../api/axios';
import type { LinkDisplayMode, LinkPreviewMeta, Message } from '../types';
import { patchMessageInCache } from '../utils/messageCache';
import { withLinkDisplay } from '../utils/linkPreviewUtils';

export function useUpdateLinkDisplay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      messageId,
      preview,
      displayAs,
      existingMeta,
    }: {
      chatId: string;
      messageId: string;
      preview: LinkPreviewMeta;
      displayAs: LinkDisplayMode;
      existingMeta?: Message['contentMeta'];
    }) => {
      const nextPreview = withLinkDisplay(preview, displayAs);
      const contentMeta = { ...existingMeta, preview: nextPreview };
      const response = await api.patch<{ message: Message }>(`/messages/${messageId}`, {
        contentMeta,
      });
      return response.data.message;
    },
    onSuccess: (message, { chatId, messageId }) => {
      if (!message) return;
      queryClient.setQueryData(['messages', chatId], (old: unknown) =>
        patchMessageInCache(old as Parameters<typeof patchMessageInCache>[0], messageId, {
          contentMeta: message.contentMeta,
          editedAt: message.editedAt ?? undefined,
        }),
      );
    },
  });
}
