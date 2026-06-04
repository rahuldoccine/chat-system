import { useState } from 'react';
import { handler } from '../../../utils/asyncHandler';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { E2EE_UNABLE_DECRYPT_TEXT } from '../../e2ee/e2eeDisplay';
import { isGroupE2eeMessage } from '../../e2ee/protocol';
import { retryGroupDecryptionForChat } from '../../e2ee/groupE2eeRecovery';
import type { Message } from '../types';
import styles from './MessageStream.module.css';

type GroupE2eeDecryptRetryProps = Readonly<{
  msg: Message;
  displayBody: string;
  activeId: string | null;
}>;

export function GroupE2eeDecryptRetry({
  msg,
  displayBody,
  activeId,
}: GroupE2eeDecryptRetryProps) {
  const { user, e2eeKeysLocked } = useAuth();
  const [pending, setPending] = useState(false);

  if (
    displayBody !== E2EE_UNABLE_DECRYPT_TEXT ||
    !isGroupE2eeMessage(msg) ||
    !activeId ||
    msg.chatId !== activeId ||
    e2eeKeysLocked ||
    !user?.id
  ) {
    return null;
  }

  const onRetry = async () => {
    setPending(true);
    try {
      await retryGroupDecryptionForChat(activeId, user.id);
      toast.message('Retrying decryption…');
    } catch {
      toast.error('Could not refresh group encryption keys.');
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      className={styles.e2eeDecryptRetry}
      disabled={pending}
      onClick={handler(() => {
        void onRetry();
      })}
    >
      {pending ? 'Retrying…' : 'Retry decryption'}
    </button>
  );
}
