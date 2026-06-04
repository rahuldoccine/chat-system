import { toast } from 'sonner';
import { E2eePeerNotReadyError } from '../../e2ee/directChat';
import { E2eeKeysLockedError } from '../../e2ee/bootstrap';
import { sendComposerMedia } from './composerSendMedia';
import { sendComposerText } from './composerSendText';
import type { ComposerSendContext, ComposerSendDeps } from './composerSend.types';

export type { ComposerSendContext, ComposerSendDeps } from './composerSend.types';

function handleComposerSendError(err: unknown): boolean {
  if (err instanceof E2eePeerNotReadyError || err instanceof E2eeKeysLockedError) {
    toast.error(err.message);
    return true;
  }
  if (err instanceof Error && /E2EE keys not initialized/i.test(err.message)) {
    toast.error('Encryption is not ready. Sign out and sign in again with your password.');
    return true;
  }
  return false;
}

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
  } catch (err) {
    if (handleComposerSendError(err)) return;
    throw err;
  } finally {
    deps.setUploadProgress(null);
  }

  deps.onSendSuccess();
}
