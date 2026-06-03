import { parseMentionsFromText } from '../utils/mentions';
import { extractFirstHttpUrl, withLinkDisplay } from '../utils/linkPreviewUtils';
import { resolveLinkPreviewForSend } from '../hooks/fetchLinkPreview';
import type { ComposerSendContext, ComposerSendDeps } from './composerSend.types';

export type TextContentMetaResult =
  | { ok: true; meta: Record<string, unknown> | undefined }
  | { ok: false };

async function resolveComposerLinkPreview(
  ctx: ComposerSendContext,
  deps: ComposerSendDeps,
  trimmedText: string,
): Promise<{ preview: import('../types').LinkPreviewMeta } | undefined> {
  if (ctx.composerPreview) {
    return { preview: withLinkDisplay(ctx.composerPreview, ctx.linkDisplayAs) };
  }
  if (ctx.isE2eeDm) return undefined;
  const url = extractFirstHttpUrl(trimmedText);
  if (!url) return undefined;
  const resolved = await resolveLinkPreviewForSend(url, deps.queryClient);
  if (!resolved) return undefined;
  return { preview: withLinkDisplay(resolved, ctx.linkDisplayAs) };
}

function buildGroupMentionsMeta(
  ctx: ComposerSendContext,
  deps: ComposerSendDeps,
  trimmedText: string,
  base: Record<string, unknown> | undefined,
): TextContentMetaResult {
  if (ctx.activeChat?.type !== 'GROUP' || !ctx.groupMembers) {
    return { ok: true, meta: base };
  }
  const parsed = parseMentionsFromText(trimmedText, ctx.groupMembers);
  if (parsed.all && !ctx.canUseAllMention) {
    deps.showAlert('@all is restricted', 'Only Owner/Admin can use @all in this group.');
    return { ok: false };
  }
  if (!parsed.all && parsed.userIds.length === 0) {
    return { ok: true, meta: base };
  }
  const mentions = parsed.all
    ? { userIds: parsed.userIds, all: true as const }
    : { userIds: parsed.userIds };
  return {
    ok: true,
    meta: base ? { ...base, mentions } : { mentions },
  };
}

export async function buildTextMessageContentMeta(
  ctx: ComposerSendContext,
  deps: ComposerSendDeps,
  trimmedText: string,
): Promise<TextContentMetaResult> {
  const linkMeta = await resolveComposerLinkPreview(ctx, deps, trimmedText);
  return buildGroupMentionsMeta(ctx, deps, trimmedText, linkMeta);
}

export async function sendComposerText(
  ctx: ComposerSendContext,
  deps: ComposerSendDeps,
  trimmedText: string,
): Promise<'sent' | 'aborted'> {
  const built = await buildTextMessageContentMeta(ctx, deps, trimmedText);
  if (!built.ok) return 'aborted';

  await deps.sendMessageAsync({
    chatId: ctx.chatId,
    text: trimmedText,
    replyToId: ctx.isThread ? undefined : ctx.replyingTo || undefined,
    kind: 'TEXT',
    contentMeta: built.meta,
    ...ctx.sendCtx,
    ...ctx.threadSendMeta,
  });
  deps.scrollToBottom();
  return 'sent';
}
