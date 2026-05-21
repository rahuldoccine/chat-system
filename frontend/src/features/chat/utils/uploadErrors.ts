import { env, maxUploadBytes } from '../../../config/env';
import { friendlyCodeMessage } from '../../../utils/userFriendlyErrors';

type ApiErrorBody = {
  code?: string;
  message?: string;
};

export function getUploadErrorMessage(error: unknown, maxUploadMb = env.maxUploadMb): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const res = (error as { response?: { status?: number; data?: ApiErrorBody } }).response;
    const code = res?.data?.code;
    const message = res?.data?.message;

    if (code === 'FILE_TOO_LARGE' || res?.status === 413) {
      return `This file exceeds the ${maxUploadMb} MB upload limit. Try a smaller file or compress it before sending.`;
    }
    if (code === 'UNSUPPORTED_MEDIA_TYPE') {
      return friendlyCodeMessage(code, 'This type of file cannot be sent here.');
    }
    if (message) return friendlyCodeMessage(code, message);
  }

  if (error instanceof Error && error.message) return error.message;
  return "We couldn't upload this file. Please try again.";
}

export function isFileTooLarge(file: File, maxBytes = maxUploadBytes()): boolean {
  return file.size > maxBytes;
}

export function fileTooLargeMessage(fileName: string, maxUploadMb = env.maxUploadMb): string {
  return `"${fileName}" exceeds the ${maxUploadMb} MB upload limit.`;
}
