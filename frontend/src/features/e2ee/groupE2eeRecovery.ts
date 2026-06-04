import { emitE2eeGroupKeysUpdated } from './e2eeEvents';
import {
  fetchGroupSenderKeys,
  getOwnSenderKeyFromServer,
  getRememberedSenderKey,
  publishSenderKey,
} from './groupSenderKeys';
import { resolveGroupMemberIds } from './groupMembers';

export async function retryGroupDecryptionForChat(
  chatId: string,
  userId: string,
): Promise<void> {
  await fetchGroupSenderKeys(chatId, userId);
  emitE2eeGroupKeysUpdated(chatId);
}

export async function refreshMyGroupSenderKeys(
  userId: string,
  chatId: string,
  memberUserIds?: string[],
): Promise<void> {
  const members = await resolveGroupMemberIds(chatId, memberUserIds);
  let key = getRememberedSenderKey(chatId, userId, 0);
  if (!key) {
    key = await getOwnSenderKeyFromServer(userId, chatId, 0);
  }
  if (!key) {
    throw new Error('No group encryption key on this device. Send a message while unlocked first.');
  }
  await publishSenderKey(userId, chatId, 0, key, members);
  emitE2eeGroupKeysUpdated(chatId);
}
