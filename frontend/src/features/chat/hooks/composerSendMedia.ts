import type { ComposerSendContext, ComposerSendDeps, UploadedEntry } from './composerSend.types';

export async function sendComposerMedia(
  ctx: ComposerSendContext,
  deps: ComposerSendDeps,
  trimmedText: string,
): Promise<'sent' | 'aborted' | 'skipped'> {
  const filesToSend = [...ctx.attachments];
  if (filesToSend.length === 0) return 'skipped';

  deps.setUploadProgress({ current: 0, total: filesToSend.length });
  const uploadedEntries: UploadedEntry[] = [];

  for (let i = 0; i < filesToSend.length; i++) {
    const file = filesToSend[i];
    deps.setUploadProgress({ current: i + 1, total: filesToSend.length });

    const { uploadResult } = await deps.uploadForChat(file);
    if (!uploadResult.ok) {
      deps.setUploadProgress(null);
      deps.resetUpload();
      deps.showAlert('Upload failed', `"${file.name}": ${uploadResult.message}`);
      return 'aborted';
    }
    const uploaded = uploadResult.data;
    const mime = uploaded.mimetype || file.type;
    uploadedEntries.push({
      uploadId: uploaded.id,
      filename: uploaded.filename,
      originalName: uploaded.originalName,
      mimetype: mime,
      size: uploaded.size,
      url: uploaded.url,
    });
  }

  const allImages = uploadedEntries.every((f) => f.mimetype.startsWith('image/'));
  await deps.sendMessageAsync({
    chatId: ctx.chatId,
    text: trimmedText,
    replyToId: ctx.isThread ? undefined : ctx.replyingTo || undefined,
    kind: allImages ? 'IMAGE' : 'FILE',
    contentMeta: { files: uploadedEntries },
    ...ctx.sendCtx,
    ...ctx.threadSendMeta,
  });
  deps.scrollToBottom();
  return 'sent';
}
