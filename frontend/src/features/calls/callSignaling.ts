import { socketService } from '../../services/socket';
import {
  defaultSocketAckFailure,
  defaultSocketAckTimeout,
  withAckTimeout,
} from '../../services/socketAck';
import { getOrCreateDeviceId } from './deviceId';
import type { CallIcePayload, CallMedia, SocketAck } from './types';

const SIGNALING_TIMEOUT_MS = 15_000;

export function emitCallOffer(payload: {
  chatId: string;
  peerUserId: string;
  sdp: string;
  media: CallMedia;
  /** Set when video was requested but no camera track is available. */
  videoFallback?: boolean;
  callId?: string;
}): Promise<SocketAck<{ callId: string }>> {
  return withAckTimeout<SocketAck<{ callId: string }>>(
    new Promise<SocketAck<{ callId: string }>>((resolve) => {
      socketService.emit(
        'call:offer',
        {
          ...payload,
          deviceId: getOrCreateDeviceId(),
        },
        (ack: SocketAck<{ callId: string }>) => resolve(ack ?? defaultSocketAckFailure()),
      );
    }),
    SIGNALING_TIMEOUT_MS,
    defaultSocketAckTimeout(),
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
        (ack: SocketAck) => resolve(ack ?? defaultSocketAckFailure()),
      );
    }),
    SIGNALING_TIMEOUT_MS,
    defaultSocketAckTimeout(),
  );
}

export function emitCallReject(callId: string, reason = 'rejected'): Promise<SocketAck> {
  return new Promise((resolve) => {
    socketService.emit('call:reject', { callId, reason }, (ack: SocketAck) =>
      resolve(ack ?? defaultSocketAckFailure()),
    );
  });
}

export function emitCallEnd(callId: string, reason = 'ended'): Promise<SocketAck> {
  return new Promise((resolve) => {
    socketService.emit('call:end', { callId, reason }, (ack: SocketAck) =>
      resolve(ack ?? defaultSocketAckFailure()),
    );
  });
}

export function emitCallIce(payload: CallIcePayload): void {
  socketService.emit('call:ice', payload);
}

export function emitCallSignal(callId: string, signal: 'mute' | 'unmute' | 'camera_on' | 'camera_off'): void {
  socketService.emit('call:signal', { callId, signal });
}

export function emitCallTranscriptLine(payload: {
  callId: string;
  text: string;
  t: number;
}): void {
  socketService.emit('call:transcript', payload);
}
