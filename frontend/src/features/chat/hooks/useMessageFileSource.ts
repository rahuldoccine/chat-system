import { useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { buildFileUrl } from '../utils/fileUrl';
import { getMessageFiles } from '../utils/fileMeta';
import type { Message } from '../types';

export function useMessageFileSource(
  contentMeta: Message['contentMeta'],
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
    ],
  );

  const fullUrl = buildFileUrl(fileRef, token);

  return { displayName, fileRef, fullUrl };
}
