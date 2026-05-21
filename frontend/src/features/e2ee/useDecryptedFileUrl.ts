import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { buildFileUrl } from '../chat/utils/fileUrl';
import type { FileAttachmentMeta } from '../chat/utils/fileMeta';
import type { Message } from '../chat/types';
import {
  e2eeMessageDepKey,
  fileAttachmentDepKey,
  transportMetaDepKey,
} from './attachmentDeps';
import { isE2eeMessage } from './directChat';
import { decryptMessageFile } from './attachmentCrypto';

type E2eeMessageRef = Pick<Message, 'id' | 'ciphertext' | 'contentMeta' | 'senderId'>;

const blobUrlCache = new Map<string, string>();
const inflightDecrypt = new Map<string, Promise<Blob | null>>();

function cacheKey(
  messageKey: string,
  fileKey: string,
  transportKey: string,
  userId: string,
): string {
  return `${userId}|${messageKey}|${fileKey}|${transportKey}`;
}

export function useDecryptedFileUrl(
  e2eeMessage: E2eeMessageRef | undefined,
  file: FileAttachmentMeta | undefined,
  transportMeta: Record<string, unknown> | undefined,
): string {
  const { user, token } = useAuth();
  const [url, setUrl] = useState('');

  const messageKey = e2eeMessageDepKey(e2eeMessage);
  const fileKey = fileAttachmentDepKey(file);
  const transportKey = transportMetaDepKey(transportMeta);

  useEffect(() => {
    if (!file) {
      setUrl('');
      return;
    }

    if (!e2eeMessage || !isE2eeMessage(e2eeMessage) || !user?.id) {
      setUrl(buildFileUrl(file, token));
      return;
    }

    const key = cacheKey(messageKey, fileKey, transportKey, user.id);
    const cached = blobUrlCache.get(key);
    if (cached) {
      setUrl(cached);
      return;
    }

    let cancelled = false;
    let run = inflightDecrypt.get(key);
    if (!run) {
      run = decryptMessageFile(
        user.id,
        e2eeMessage,
        file,
        user.id,
        token,
        transportMeta,
      );
      inflightDecrypt.set(key, run);
      void run.finally(() => {
        inflightDecrypt.delete(key);
      });
    }

    void run.then((blob) => {
      if (cancelled) return;
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        blobUrlCache.set(key, objectUrl);
        setUrl(objectUrl);
      } else {
        setUrl('');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [messageKey, fileKey, transportKey, user?.id, token]);

  return url;
}
