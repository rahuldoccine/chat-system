import type { Message } from '../chat/types';
import { encryptDirectMessage, E2eePeerNotReadyError } from './directChat';
import { getLocalKeyMaterial } from './keyAccess';
import { resolveGroupMemberIds } from './groupMembers';
import { getRememberedPeerDevice } from './peerDevice';
import { buildSenderCopyMeta } from './senderCopy';
import { E2EE_VERSION, type DmV1Payload } from './protocol';
import { isPlainObject } from '../../utils/plainObject';

export type RecipientCiphertexts = Record<string, string>;

export function parseRecipientCiphertexts(meta: unknown): RecipientCiphertexts | null {
  if (!isPlainObject(meta)) return null;
  const raw = meta.recipientCiphertexts;
  if (!isPlainObject(raw)) return null;
  const out: RecipientCiphertexts = {};
  for (const [userId, ct] of Object.entries(raw)) {
    if (typeof ct === 'string' && ct.length > 0) out[userId] = ct;
  }
  return Object.keys(out).length ? out : null;
}

/** Group messages fanning out dm-v1 envelopes per member (not legacy group-v1 sender-key). */
export function isGroupDmE2eeMessage(msg: {
  contentMeta?: Record<string, unknown> | null;
}): boolean {
  if (msg.contentMeta?.e2eeVersion !== E2EE_VERSION) return false;
  return parseRecipientCiphertexts(msg.contentMeta) !== null;
}

export function resolveViewerCiphertext(
  msg: Pick<Message, 'ciphertext' | 'contentMeta'>,
  viewerUserId: string,
): string | null {
  const map = parseRecipientCiphertexts(msg.contentMeta);
  if (map) {
    const hit = map[viewerUserId];
    if (typeof hit === 'string' && hit.length > 0) return hit;
  }
  const ct = msg.ciphertext;
  return typeof ct === 'string' && ct.length > 0 ? ct : null;
}

export async function encryptGroupDmMessage(
  userId: string,
  chatId: string,
  memberUserIds: string[],
  plaintext: string,
  meta?: Record<string, unknown>,
): Promise<{
  ciphertext: string;
  contentMeta: Record<string, unknown>;
}> {
  const material = await getLocalKeyMaterial(userId);
  if (!material) {
    throw new Error('E2EE keys not initialized');
  }

  const members = await resolveGroupMemberIds(chatId, memberUserIds);
  const recipients = members.filter((id) => id && id !== userId);
  if (!recipients.length) {
    throw new Error('Group has no other members to encrypt for');
  }

  const recipientCiphertexts: RecipientCiphertexts = {};
  let transportMeta: Record<string, unknown> | null = null;

  for (const peerUserId of recipients) {
    try {
      const enc = await encryptDirectMessage(userId, {
        peerUserId,
        plaintext,
        contentMeta: meta,
        preferPeerDeviceId: getRememberedPeerDevice(peerUserId),
      });
      recipientCiphertexts[peerUserId] = enc.ciphertext;
      transportMeta ??= enc.contentMeta;
    } catch (err) {
      if (err instanceof E2eePeerNotReadyError) throw err;
      throw new E2eePeerNotReadyError(
        `Could not encrypt for a group member (${peerUserId}). They may need to sign in and finish encryption setup.`,
      );
    }
  }

  const payload: DmV1Payload = {
    text: plaintext,
    meta: meta && Object.keys(meta).length ? meta : undefined,
  };
  const senderCopy = await buildSenderCopyMeta(material, payload);

  const firstEnvelope = recipientCiphertexts[recipients[0]!]!;
  return {
    ciphertext: firstEnvelope,
    contentMeta: {
      ...(transportMeta ?? {}),
      e2eeVersion: E2EE_VERSION,
      recipientCiphertexts,
      senderCopy,
    },
  };
}
