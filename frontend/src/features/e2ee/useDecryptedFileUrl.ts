import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { buildFileUrl } from '../chat/utils/fileUrl';
import type { FileAttachmentMeta } from '../chat/utils/fileMeta';
import type { Message } from '../chat/types';
import {
  e2eeMessageDepKey,
  fileAttachmentIdentityKey,
  fileHasDecryptKeys,
} from './attachmentDeps';
import { isE2eeMessage } from './directChat';
import { isGroupE2eeMessage } from './protocol';
import { decryptMessageFile } from './attachmentCrypto';

type E2eeMessageRef = Pick<Message, 'id' | 'ciphertext' | 'contentMeta' | 'senderId'>;

const blobUrlCache = new Map<string, string>();
const inflightDecrypt = new Map<string, Promise<Blob | null>>();

function stableBlobCacheKey(userId: string, messageKey: string, fileIdentity: string): string {
  return `${userId}|${messageKey}|${fileIdentity}`;
}

export function useDecryptedFileUrl(
  e2eeMessage: E2eeMessageRef | undefined,
  file: FileAttachmentMeta | undefined,
  transportMeta: Record<string, unknown> | undefined,
): string {
  const { user, token } = useAuth();
  const [url, setUrl] = useState('');
  const transportMetaRef = useRef(transportMeta);
  transportMetaRef.current = transportMeta;

  const messageKey = e2eeMessageDepKey(e2eeMessage);
  const fileIdentity = fileAttachmentIdentityKey(file);
  const hasKeys = fileHasDecryptKeys(file);

  useEffect(() => {
    if (!file) {
      setUrl('');
      return;
    }

    if (!e2eeMessage || !isE2eeMessage(e2eeMessage) || !user?.id) {
      setUrl(buildFileUrl(file, token));
      return;
    }

    if (!hasKeys) {
      // GROUP E2EE may upload attachments without per-file keys.
      // In that case, we can still render the media from the plain uploaded bytes.
      if (isGroupE2eeMessage(e2eeMessage)) {
        setUrl(buildFileUrl(file, token));
      }
      return;
    }

    const key = stableBlobCacheKey(user.id, messageKey, fileIdentity);
    const cached = blobUrlCache.get(key);
    if (cached) {
      setUrl(cached);
      return;
    }

    let cancelled = false;
    let run = inflightDecrypt.get(key);
    run ??= decryptMessageFile(
      user.id,
      e2eeMessage,
      file,
      user.id,
      token,
      transportMetaRef.current,
    );
    if (!inflightDecrypt.has(key)) {
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
        return;
      }
      // GROUP E2EE attachments may be plain uploads even when attachment keys exist/infer.
      // If decrypt returns null, fall back to direct file URL so UI never stays blank.
      if (isGroupE2eeMessage(e2eeMessage)) {
        setUrl(buildFileUrl(file, token));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [messageKey, fileIdentity, hasKeys, user?.id, token, file, e2eeMessage]);

  return url;
}
