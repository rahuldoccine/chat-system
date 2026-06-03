import type { Message } from '../types';
import type { SearchMessageHit } from '../hooks/useChatMessageSearch';
import {
  getMessageDisplayBody,
  getDecryptedPollMeta,
  messageWithDecryptedMeta,
  type DecryptedBody,
} from '../../e2ee/useMessageBodies';
import { isE2eeMessage } from '../../e2ee/directChat';
import { getMessageFiles } from './fileMeta';
import { getMessagePreviewText } from './messagePreview';

export function buildSearchSnippet(text: string, q: string, maxLen = 120): string {
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx < 0) {
    return text.length <= maxLen ? text : `${text.slice(0, maxLen)}…`;
  }
  const half = Math.floor((maxLen - needle.length) / 2);
  const start = Math.max(0, idx - half);
  let snippet = text.slice(start, start + maxLen);
  if (start > 0) snippet = `…${snippet}`;
  if (start + maxLen < text.length) snippet = `${snippet}…`;
  return snippet;
}

function collectFileSearchParts(displayMsg: Message): string[] {
  const files = getMessageFiles(displayMsg);
  if (!files?.length) return [];
  const parts: string[] = [];
  for (const f of files) {
    if (f.originalName) parts.push(f.originalName);
    if (f.filename) parts.push(f.filename);
  }
  return parts;
}

function collectPollSearchParts(
  msg: Message,
  bodies: Record<string, DecryptedBody>,
  userId: string,
): string[] {
  const poll = getDecryptedPollMeta(msg, bodies, userId);
  if (!poll) return [];
  const parts: string[] = [];
  if (poll.question) parts.push(poll.question);
  for (const opt of poll.options ?? []) {
    if (opt.label) parts.push(opt.label);
  }
  return parts;
}

/** Plaintext and labels to match against for in-chat search (E2EE client-side). */
export function getSearchableMessageText(
  msg: Message,
  bodies: Record<string, DecryptedBody>,
  userId: string,
): string {
  const parts: string[] = [];
  const display = getMessageDisplayBody(msg, bodies, userId);
  if (display && display !== '…' && display !== '[Unable to decrypt]') {
    parts.push(display);
  }

  const displayMsg = messageWithDecryptedMeta(msg, bodies);
  const preview = getMessagePreviewText(msg, bodies, userId);
  if (preview && preview !== 'Decrypting…') parts.push(preview);

  parts.push(...collectFileSearchParts(displayMsg), ...collectPollSearchParts(msg, bodies, userId));

  return parts.join(' ').trim();
}

export function isMessageDecryptPending(
  msg: Message,
  bodies: Record<string, DecryptedBody>,
  userId: string,
): boolean {
  if (!isE2eeMessage(msg) || !msg.ciphertext || msg.deletedAt) return false;
  if (msg.senderId === userId) return false;
  return bodies[msg.id] === undefined;
}

export function searchMessagesLocally(
  messages: Message[],
  bodies: Record<string, DecryptedBody>,
  query: string,
  userId: string,
  limit = 20,
): SearchMessageHit[] {
  const needle = query.toLowerCase();
  const hits: SearchMessageHit[] = [];

  for (const msg of messages) {
    if (msg.deletedAt || msg.kind === 'SYSTEM') continue;
    const searchable = getSearchableMessageText(msg, bodies, userId);
    if (!searchable?.toLowerCase().includes(needle)) continue;

    hits.push({
      messageId: msg.id,
      createdAt: msg.createdAt,
      snippet: buildSearchSnippet(searchable, query),
      sender: {
        id: msg.sender.id,
        email: msg.sender.email ?? '',
        displayName: msg.sender.displayName ?? msg.sender.name ?? null,
        avatarUrl: msg.sender.avatarUrl ?? null,
        username: null,
      },
    });
  }

  const sorted = hits.toSorted(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return sorted.slice(0, limit);
}
