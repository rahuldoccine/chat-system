import { useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { buildFileUrl } from '../utils/fileUrl';
import { getMessageFiles } from '../utils/fileMeta';
import { useDecryptedFileUrl } from '../../e2ee/useDecryptedFileUrl';
import { isE2eeMessage } from '../../e2ee/directChat';
import type { ContentMeta, Message } from '../types';

type E2eeMessagePick = Pick<Message, 'id' | 'ciphertext' | 'contentMeta' | 'senderId'>;

export function useMessageFileSource(
  contentMeta: Message['contentMeta'],
  e2eeMessage: E2eeMessagePick | undefined,
  transportMeta: ContentMeta | undefined,
  defaultLabel: string,
) {
  const { token } = useAuth();
  const files = getMessageFiles({ kind: 'FILE', contentMeta });
  const primary = files?.[0];
  const meta = contentMeta ?? {};
  const displayName =
    meta.originalName || meta.filename || primary?.originalName || primary?.filename || defaultLabel;

  const fileRef = useMemo(
    () => ({
      filename: meta.filename ?? primary?.filename,
      url: meta.url ?? primary?.url,
      mimetype: meta.mimetype ?? primary?.mimetype,
      uploadId: meta.uploadId ?? primary?.uploadId,
      originalName: meta.originalName ?? primary?.originalName,
      attachment: primary?.attachment,
    }),
    [
      meta.filename,
      meta.url,
      meta.mimetype,
      meta.uploadId,
      meta.originalName,
      primary?.filename,
      primary?.url,
      primary?.mimetype,
      primary?.uploadId,
      primary?.originalName,
      primary?.attachment,
    ],
  );

  const decryptedUrl = useDecryptedFileUrl(e2eeMessage, fileRef, transportMeta);
  const fullUrl =
    e2eeMessage && isE2eeMessage(e2eeMessage) ? decryptedUrl : buildFileUrl(fileRef, token);
  const isE2eeLoading = Boolean(e2eeMessage && isE2eeMessage(e2eeMessage) && !fullUrl);

  return { displayName, fileRef, fullUrl, isE2eeLoading };
}
