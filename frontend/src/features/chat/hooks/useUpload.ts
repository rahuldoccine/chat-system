import { useState, useCallback } from 'react';
import api from '../../../api/axios';
import { getUploadErrorMessage } from '../utils/uploadErrors';

export interface UploadResult {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
}

export type UploadFileResponse =
  | { ok: true; data: UploadResult }
  | { ok: false; code?: string; message: string };

export interface UploadState {
  progress: number;
  status: 'idle' | 'uploading' | 'success' | 'error';
  error: string | null;
}

export const useUpload = () => {
  const [state, setState] = useState<UploadState>({
    progress: 0,
    status: 'idle',
    error: null,
  });

  const uploadFile = useCallback(
    async (
      file: File,
      chatId?: string,
      options?: { voiceNote?: boolean },
    ): Promise<UploadFileResponse> => {
      setState({ progress: 0, status: 'uploading', error: null });

      const formData = new FormData();
      if (chatId) {
        formData.append('chatId', chatId);
      }
      if (options?.voiceNote) {
        formData.append('voiceNote', 'true');
      }
      formData.append('file', file);

      try {
        const response = await api.post<UploadResult>('/uploads', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || 100),
            );
            setState((prev) => ({ ...prev, progress: percentCompleted }));
          },
        });

        setState({ progress: 100, status: 'success', error: null });
        return { ok: true, data: response.data };
      } catch (err: unknown) {
        const code =
          err &&
          typeof err === 'object' &&
          'response' in err
            ? (err as { response?: { data?: { code?: string } } }).response?.data?.code
            : undefined;
        const message = getUploadErrorMessage(err);
        setState({ progress: 0, status: 'error', error: message });
        return { ok: false, code, message };
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setState({ progress: 0, status: 'idle', error: null });
  }, []);

  return { ...state, uploadFile, reset };
};
