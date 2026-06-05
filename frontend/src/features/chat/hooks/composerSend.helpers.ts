import { sendComposerMedia } from './composerSendMedia';
import { sendComposerText } from './composerSendText';
import type { ComposerSendContext, ComposerSendDeps } from './composerSend.types';

export type { ComposerSendContext, ComposerSendDeps } from './composerSend.types';

export async function sendComposerMessage(
  ctx: ComposerSendContext,
  deps: ComposerSendDeps,
): Promise<void> {
  if (ctx.editingMessage) {
    const trimmed = ctx.text.trim();
    if (trimmed === ctx.editingMessage.text.trim()) {
      deps.onEditCancelled();
      return;
    }
    deps.editMessage(
      { chatId: ctx.chatId, messageId: ctx.editingMessage.id, text: trimmed, ...ctx.sendCtx },
      {
        onSuccess: deps.onEditSuccess,
        onError: () => {
          deps.showAlert("Couldn't save your edit", 'Please try again.');
        },
      },
    );
    return;
  }

  if (!ctx.text.trim() && ctx.attachments.length === 0) {
    return;
  }

  const trimmedText = ctx.text.trim();

  try {
    const outcome =
      ctx.attachments.length > 0
        ? await sendComposerMedia(ctx, deps, trimmedText)
        : await sendComposerText(ctx, deps, trimmedText);
    if (outcome !== 'sent') return;
  } finally {
    deps.setUploadProgress(null);
  }

  deps.onSendSuccess();
}
