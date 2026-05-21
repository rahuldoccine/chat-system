export type CallPhase =
  | 'idle'
  | 'ringing_out'
  | 'ringing_in'
  | 'connecting'
  | 'connected'
  | 'ended';

export type CallSignal = 'mute' | 'unmute' | 'camera_on' | 'camera_off';

export type CallContentMeta = {
  callId: string;
  kind: 'AUDIO' | 'VIDEO';
  status: 'completed' | 'missed' | 'rejected' | 'cancelled';
  durationSec?: number;
  initiatorId: string;
  peerId: string;
};

/** Signaling: `video` is the requested call type (video vs voice), not local track availability. */
export type CallMedia = {
  audio: boolean;
  video: boolean;
};

export type CallMeta = {
  callId: string;
  chatId: string;
  peerUserId: string;
  peerDisplayName: string;
  peerAvatarUrl?: string | null;
  isVideo: boolean;
  isInitiator: boolean;
  connectedAt?: number | null;
};

export type IncomingCallPayload = {
  callId: string;
  chatId: string;
  fromUserId: string;
  sdp: string;
  media: CallMedia;
  createdAt?: string;
};

export type CallIcePayload = {
  callId: string;
  candidate: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
};

export type SocketAck<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; code?: string; message?: string };

/** UI-only meta before server assigns callId */
export type OutgoingPreview = {
  chatId: string;
  peerUserId: string;
  peerDisplayName: string;
  isVideo: boolean;
};
