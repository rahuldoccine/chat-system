import { socketService } from '../../services/socket';
import { friendlySocketAckMessage } from '../../utils/userFriendlyErrors';
import { getOrCreateDeviceId } from './deviceId';
import type { CallIcePayload, CallMedia, SocketAck } from './types';

const SIGNALING_TIMEOUT_MS = 15_000;

function withAckTimeout<T>(promise: Promise<SocketAck<T>>, ms = SIGNALING_TIMEOUT_MS): Promise<SocketAck<T>> {
  return Promise.race([
    promise,
    new Promise<SocketAck<T>>((resolve) => {
      window.setTimeout(
        () =>
          resolve({
            ok: false,
            code: 'TIMEOUT',
            message: friendlySocketAckMessage('TIMEOUT', undefined, "The call didn't connect in time. Please try again."),
          }),
        ms,
      );
    }),
  ]);
}

export function emitCallOffer(payload: {
  chatId: string;
  peerUserId: string;
  sdp: string;
  media: CallMedia;
  /** Set when video was requested but no camera track is available. */
  videoFallback?: boolean;
  callId?: string;
}): Promise<SocketAck<{ callId: string }>> {
  return withAckTimeout(
    new Promise((resolve) => {
      socketService.emit(
        'call:offer',
        {
          ...payload,
          deviceId: getOrCreateDeviceId(),
        },
        (ack: SocketAck<{ callId: string }>) =>
          resolve(
            ack ?? {
              ok: false,
              message: friendlySocketAckMessage(undefined, undefined, 'No response from the server. Try again.'),
            },
          ),
      );
    }),
  );
}

export function emitCallAnswer(payload: {
  callId: string;
  sdp: string;
}): Promise<SocketAck> {
  return withAckTimeout(
    new Promise((resolve) => {
      socketService.emit(
        'call:answer',
        { ...payload, deviceId: getOrCreateDeviceId() },
        (ack: SocketAck) =>
          resolve(
            ack ?? {
              ok: false,
              message: friendlySocketAckMessage(undefined, undefined, 'No response from the server. Try again.'),
            },
          ),
      );
    }),
  );
}

export function emitCallReject(callId: string, reason = 'rejected'): Promise<SocketAck> {
  return new Promise((resolve) => {
    socketService.emit('call:reject', { callId, reason }, (ack: SocketAck) =>
      resolve(
        ack ?? {
          ok: false,
          message: friendlySocketAckMessage(undefined, undefined, 'No response from the server. Try again.'),
        },
      ),
    );
  });
}

export function emitCallEnd(callId: string, reason = 'ended'): Promise<SocketAck> {
  return new Promise((resolve) => {
    socketService.emit('call:end', { callId, reason }, (ack: SocketAck) =>
      resolve(
        ack ?? {
          ok: false,
          message: friendlySocketAckMessage(undefined, undefined, 'No response from the server. Try again.'),
        },
      ),
    );
  });
}

export function emitCallIce(payload: CallIcePayload): void {
  socketService.emit('call:ice', payload);
}

export function emitCallSignal(callId: string, signal: 'mute' | 'unmute' | 'camera_on' | 'camera_off'): void {
  socketService.emit('call:signal', { callId, signal });
}
