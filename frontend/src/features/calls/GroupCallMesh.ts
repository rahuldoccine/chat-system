import { buildIceServers } from './iceConfig';

export type GroupCallSignalType = 'offer' | 'answer' | 'ice';

export type GroupCallSignalEmitter = (
  targetUserId: string,
  type: GroupCallSignalType,
  payload: unknown,
) => void;

type IcePayload = {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
};

type SdpPayload = {
  sdp: string;
};

type PeerEntry = {
  pc: RTCPeerConnection;
  remoteStream: MediaStream | null;
  pendingIce: RTCIceCandidateInit[];
};

/** Lower user id creates the WebRTC offer to avoid offer/answer glare. */
function shouldInitiateOffer(localUserId: string, peerUserId: string): boolean {
  return localUserId.localeCompare(peerUserId) < 0;
}

function parseSdpPayload(payload: unknown): string | null {
  if (typeof payload === 'string' && payload.length > 0) return payload;
  if (payload && typeof payload === 'object' && 'sdp' in payload) {
    const sdp = (payload as SdpPayload).sdp;
    return typeof sdp === 'string' ? sdp : null;
  }
  return null;
}

function parseIcePayload(payload: unknown): RTCIceCandidateInit | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as IcePayload;
  if (typeof p.candidate !== 'string' || !p.candidate) return null;
  return {
    candidate: p.candidate,
    sdpMid: p.sdpMid ?? null,
    sdpMLineIndex: p.sdpMLineIndex ?? null,
  };
}

export class GroupCallMesh {
  private sessionId: string | null = null;
  private localUserId: string | null = null;
  private localStream: MediaStream | null = null;
  private emit: GroupCallSignalEmitter | null = null;
  private readonly peers = new Map<string, PeerEntry>();
  private readonly listeners = new Set<() => void>();
  private readonly onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.onChange();
    this.listeners.forEach((l) => l());
  }

  setSignaler(emit: GroupCallSignalEmitter | null): void {
    this.emit = emit;
  }

  start(sessionId: string, localUserId: string, localStream: MediaStream): void {
    this.sessionId = sessionId;
    this.localUserId = localUserId;
    this.localStream = localStream;
  }

  stop(): void {
    for (const entry of this.peers.values()) {
      entry.pc.close();
    }
    this.peers.clear();
    this.sessionId = null;
    this.localUserId = null;
    this.localStream = null;
    this.notify();
  }

  updateLocalStream(stream: MediaStream | null): void {
    this.localStream = stream;
    if (!stream) return;
    for (const entry of this.peers.values()) {
      this.syncLocalTracks(entry.pc, stream);
    }
  }

  replaceVideoTrack(track: MediaStreamTrack | null): void {
    for (const entry of this.peers.values()) {
      const sender = entry.pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) void sender.replaceTrack(track);
    }
  }

  getRemoteStreams(): Record<string, MediaStream> {
    const out: Record<string, MediaStream> = {};
    for (const [peerId, entry] of this.peers) {
      if (entry.remoteStream) out[peerId] = entry.remoteStream;
    }
    return out;
  }

  getRemoteStream(peerUserId: string): MediaStream | null {
    return this.peers.get(peerUserId)?.remoteStream ?? null;
  }

  syncParticipants(participantIds: string[]): void {
    if (!this.localUserId || !this.sessionId) return;
    const remotes = participantIds.filter((id) => id !== this.localUserId);
    for (const peerId of remotes) {
      void this.ensurePeer(peerId);
    }
    for (const peerId of [...this.peers.keys()]) {
      if (!remotes.includes(peerId)) this.removePeer(peerId);
    }
  }

  async handleSignal(
    fromUserId: string,
    type: GroupCallSignalType,
    payload: unknown,
  ): Promise<void> {
    if (!this.localUserId || fromUserId === this.localUserId) return;

    if (type === 'offer') {
      const sdp = parseSdpPayload(payload);
      if (sdp) await this.handleOffer(fromUserId, sdp);
      return;
    }
    if (type === 'answer') {
      const sdp = parseSdpPayload(payload);
      if (sdp) await this.handleAnswer(fromUserId, sdp);
      return;
    }
    if (type === 'ice') {
      const init = parseIcePayload(payload);
      if (init) await this.handleIce(fromUserId, init);
    }
  }

  private removePeer(peerUserId: string): void {
    const entry = this.peers.get(peerUserId);
    if (!entry) return;
    entry.pc.close();
    this.peers.delete(peerUserId);
    this.notify();
  }

  private createPeerConnection(peerUserId: string): PeerEntry {
    const pc = new RTCPeerConnection({ iceServers: buildIceServers() });
    const entry: PeerEntry = { pc, remoteStream: null, pendingIce: [] };

    pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      if (stream) {
        entry.remoteStream = stream;
        this.notify();
      }
    };

    pc.onicecandidate = (ev) => {
      if (!ev.candidate?.candidate || !this.emit) return;
      this.emit(peerUserId, 'ice', {
        candidate: ev.candidate.candidate,
        sdpMid: ev.candidate.sdpMid,
        sdpMLineIndex: ev.candidate.sdpMLineIndex,
      });
    };

    if (this.localStream) {
      this.syncLocalTracks(pc, this.localStream);
    }

    this.peers.set(peerUserId, entry);
    return entry;
  }

  private syncLocalTracks(pc: RTCPeerConnection, stream: MediaStream): void {
    const senders = pc.getSenders();
    for (const track of stream.getTracks()) {
      const existing = senders.find((s) => s.track?.kind === track.kind);
      if (existing) {
        void existing.replaceTrack(track);
      } else {
        pc.addTrack(track, stream);
      }
    }
  }

  private async ensurePeer(peerUserId: string): Promise<void> {
    if (this.peers.has(peerUserId) || !this.localUserId || !this.emit) return;

    this.createPeerConnection(peerUserId);

    if (shouldInitiateOffer(this.localUserId, peerUserId)) {
      await this.sendOffer(peerUserId);
    }
  }

  private async sendOffer(peerUserId: string): Promise<void> {
    const entry = this.peers.get(peerUserId);
    if (!entry || !this.emit) return;
    try {
      const offer = await entry.pc.createOffer();
      await entry.pc.setLocalDescription(offer);
      if (offer.sdp) {
        this.emit(peerUserId, 'offer', { sdp: offer.sdp });
      }
    } catch (err) {
      console.warn('[group-call] createOffer failed', peerUserId, err);
    }
  }

  private async handleOffer(peerUserId: string, sdp: string): Promise<void> {
    let entry = this.peers.get(peerUserId);
    if (!entry) {
      entry = this.createPeerConnection(peerUserId);
    }
    if (!this.emit) return;

    try {
      await entry.pc.setRemoteDescription({ type: 'offer', sdp });
      await this.flushIce(peerUserId);
      const answer = await entry.pc.createAnswer();
      await entry.pc.setLocalDescription(answer);
      if (answer.sdp) {
        this.emit(peerUserId, 'answer', { sdp: answer.sdp });
      }
    } catch (err) {
      console.warn('[group-call] handleOffer failed', peerUserId, err);
    }
  }

  private async handleAnswer(peerUserId: string, sdp: string): Promise<void> {
    const entry = this.peers.get(peerUserId);
    if (!entry) return;
    try {
      await entry.pc.setRemoteDescription({ type: 'answer', sdp });
      await this.flushIce(peerUserId);
    } catch (err) {
      console.warn('[group-call] handleAnswer failed', peerUserId, err);
    }
  }

  private async handleIce(peerUserId: string, init: RTCIceCandidateInit): Promise<void> {
    const entry = this.peers.get(peerUserId);
    if (!entry) return;
    if (!entry.pc.remoteDescription) {
      entry.pendingIce.push(init);
      return;
    }
    try {
      await entry.pc.addIceCandidate(init);
    } catch {
      /* stale */
    }
  }

  private async flushIce(peerUserId: string): Promise<void> {
    const entry = this.peers.get(peerUserId);
    if (!entry) return;
    const queue = [...entry.pendingIce];
    entry.pendingIce = [];
    for (const init of queue) {
      try {
        await entry.pc.addIceCandidate(init);
      } catch {
        /* ignore */
      }
    }
  }
}
