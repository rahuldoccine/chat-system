import { friendlySocketAckMessage } from '../utils/userFriendlyErrors';
import { socketService } from './socket';

export type SocketAck<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; code?: string; message?: string };

export function withAckTimeout<T extends SocketAck>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      globalThis.setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

export function emitWithAck<T = unknown>(
  event: string,
  payload: unknown,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = socketService.getSocket();
    if (!socket?.connected) {
      reject(new Error('Socket not connected'));
      return;
    }

    const timer = globalThis.setTimeout(() => {
      reject(new Error(`Socket ${event} timed out`));
    }, timeoutMs);

    socket.emit(event, payload, (response: SocketAck) => {
      globalThis.clearTimeout(timer);
      if (response?.ok) {
        resolve((response.data ?? response) as T);
        return;
      }
      reject(new Error(response?.message ?? `Socket ${event} failed`));
    });
  });
}

export function defaultSocketAckFailure(message?: string): SocketAck {
  return {
    ok: false,
    message: friendlySocketAckMessage(undefined, undefined, message ?? 'No response from the server. Try again.'),
  };
}

export function defaultSocketAckTimeout<T = unknown>(message?: string): SocketAck<T> {
  return {
    ok: false,
    code: 'TIMEOUT',
    message: friendlySocketAckMessage('TIMEOUT', undefined, message ?? "The call didn't connect in time. Please try again."),
  };
}
