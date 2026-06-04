import {
  cameraFacingFromTrack,
  switchCallCamera,
  type CameraFacing,
} from './cameraSwitch';
import { buildIceServers } from './iceConfig';
import { acquireUserMedia } from './mediaErrors';
import type { CallIcePayload, CallMeta, CallPhase } from './types';

export type CallConnectionUiState = 'connecting' | 'good' | 'poor' | 'reconnecting';

export type IceEmitPayload = {
  callId: string;
  candidate: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
};

type StateListener = () => void;

class CallManager {
  private phase: CallPhase = 'idle';
  private meta: CallMeta | null = null;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private pendingIceOutbound: IceEmitPayload[] = [];
  private iceEmit: ((payload: IceEmitPayload) => void) | null = null;
  private readonly listeners = new Set<StateListener>();
  private endReason: string | null = null;
  /** Set when a video call runs without a camera (audio-only fallback). */
  private videoFallback = false;
  private connectionUi: CallConnectionUiState = 'connecting';
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private onPeerFailed: (() => void) | null = null;
  private cameraFacing: CameraFacing = 'user';

  getPhase(): CallPhase {
    return this.phase;
  }

  getMeta(): CallMeta | null {
    return this.meta;
  }

  getEndReason(): string | null {
    return this.endReason;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  hadVideoFallback(): boolean {
    return this.videoFallback;
  }

  getConnectionUi(): CallConnectionUiState {
    return this.connectionUi;
  }

  setPeerFailedHandler(handler: (() => void) | null): void {
    this.onPeerFailed = handler;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setIceEmitter(emit: ((payload: IceEmitPayload) => void) | null): void {
    this.iceEmit = emit;
  }

  setMeta(meta: CallMeta): void {
    this.meta = meta;
    this.flushOutboundIce();
    this.notify();
  }

  private flushOutboundIce(): void {
    if (!this.meta?.callId || !this.iceEmit) return;
    const queue = [...this.pendingIceOutbound];
    this.pendingIceOutbound = [];
    for (const payload of queue) {
      this.iceEmit({ ...payload, callId: this.meta.callId });
    }
  }

  setPhase(phase: CallPhase, reason?: string): void {
    this.phase = phase;
    if (reason) this.endReason = reason;
    this.notify();
  }

  isBusy(): boolean {
    return this.phase !== 'idle' && this.phase !== 'ended';
  }

  /** Outgoing: acquire media, create offer SDP (caller emits offer). */
  async createOffer(isVideo: boolean): Promise<{ sdp: string; effectiveVideo: boolean }> {
    if (this.isBusy()) {
      throw new Error('Already in a call');
    }
    this.endReason = null;
    const effectiveVideo = await this.acquireMedia(isVideo);
    this.createPeerConnection();
    const pc = this.requirePeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (!offer.sdp) throw new Error('Failed to create offer');
    this.setPhase('ringing_out');
    return { sdp: offer.sdp, effectiveVideo };
  }

  /** Incoming: acquire media, apply remote offer, create answer SDP. */
  async createAnswer(remoteSdp: string, isVideo: boolean): Promise<{ sdp: string; effectiveVideo: boolean }> {
    if (this.phase !== 'ringing_in') {
      throw new Error('No incoming call to answer');
    }
    this.setPhase('connecting');
    const effectiveVideo = await this.acquireMedia(isVideo);
    this.createPeerConnection();
    const pc = this.requirePeerConnection();
    await pc.setRemoteDescription({ type: 'offer', sdp: remoteSdp });
    await this.flushPendingIce();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (!answer.sdp) throw new Error('Failed to create answer');
    return { sdp: answer.sdp, effectiveVideo };
  }

  /** Caller receives answer SDP. */
  async applyAnswer(remoteSdp: string): Promise<void> {
    if (!this.pc) return;
    this.setPhase('connecting');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: remoteSdp });
    await this.flushPendingIce();
  }

  stageIncoming(meta: CallMeta): void {
    if (this.isBusy()) return;
    this.meta = meta;
    this.phase = 'ringing_in';
    this.endReason = null;
    this.notify();
  }

  async handleRemoteIce(payload: CallIcePayload): Promise<void> {
    const init: RTCIceCandidateInit = {
      candidate: payload.candidate,
      sdpMid: payload.sdpMid ?? null,
      sdpMLineIndex: payload.sdpMLineIndex ?? null,
    };
    if (!this.pc?.remoteDescription) {
      this.pendingIce.push(init);
      return;
    }
    try {
      await this.pc.addIceCandidate(init);
    } catch {
      /* ignore stale candidates */
    }
  }

  toggleMute(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    this.notify();
    return track.enabled;
  }

  toggleCamera(): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    this.notify();
    return track.enabled;
  }

  async switchCamera(): Promise<boolean> {
    if (!this.pc || !this.localStream) return false;
    const track = this.localStream.getVideoTracks()[0];
    if (!track) return false;

    const result = await switchCallCamera(this.pc, this.localStream, this.cameraFacing);
    if (!result.ok) return false;

    this.cameraFacing = result.facing;
    const updated = this.localStream.getVideoTracks()[0];
    if (updated) {
      updated.enabled = true;
      const fromTrack = cameraFacingFromTrack(updated);
      if (fromTrack) this.cameraFacing = fromTrack;
    }
    this.notify();
    return true;
  }

  setConnectedAt(ts: number): void {
    if (this.meta) this.meta = { ...this.meta, connectedAt: ts };
    this.notify();
  }

  cleanup(): void {
    this.clearDisconnectTimer();
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.remoteStream = null;
    this.pendingIce = [];
    this.meta = null;
    this.phase = 'idle';
    this.endReason = null;
    this.videoFallback = false;
    this.connectionUi = 'connecting';
    this.cameraFacing = 'user';
    this.notify();
  }

  endLocally(reason?: string): void {
    if (reason) this.endReason = reason;
    this.phase = 'ended';
    this.cleanup();
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  /** @returns whether the call actually has video tracks */
  private async acquireMedia(isVideo: boolean): Promise<boolean> {
    if (this.localStream) {
      return this.localStream.getVideoTracks().length > 0;
    }
    const { stream, videoFallback } = await acquireUserMedia(isVideo);
    this.localStream = stream;
    this.videoFallback = videoFallback;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      this.cameraFacing = cameraFacingFromTrack(videoTrack) ?? 'user';
    }
    if (this.meta) {
      this.meta = { ...this.meta, isVideo: isVideo && !videoFallback };
    }
    this.notify();
    return isVideo && !videoFallback;
  }

  private requirePeerConnection(): RTCPeerConnection {
    if (!this.pc) throw new Error('Peer connection not initialized');
    return this.pc;
  }

  private createPeerConnection(): void {
    if (this.pc) return;
    const pc = new RTCPeerConnection({ iceServers: buildIceServers() });
    const stream = this.localStream;
    if (stream) {
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }
    }

    pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      if (stream) {
        this.remoteStream = stream;
        this.notify();
      }
    };

    pc.onicecandidate = (ev) => {
      if (!ev.candidate?.candidate || !this.iceEmit) return;
      const payload: IceEmitPayload = {
        callId: this.meta?.callId ?? '',
        candidate: ev.candidate.candidate,
        sdpMid: ev.candidate.sdpMid ?? undefined,
        sdpMLineIndex: ev.candidate.sdpMLineIndex ?? undefined,
      };
      if (!this.meta?.callId) {
        this.pendingIceOutbound.push(payload);
        return;
      }
      this.iceEmit(payload);
    };

    pc.oniceconnectionstatechange = () => {
      this.applyIceConnectionState(pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => this.handlePeerConnectionState(pc.connectionState);

    this.pc = pc;
  }

  private handlePeerConnectionState(state: RTCPeerConnectionState): void {
    if (state === 'connected') {
      this.clearDisconnectTimer();
      this.setConnectionUi('good');
      this.setPhase('connected');
      return;
    }
    if (state === 'connecting') {
      this.setConnectionUi('connecting');
      return;
    }
    if (state === 'disconnected') {
      this.setConnectionUi('reconnecting');
      this.scheduleDisconnectEnd();
      return;
    }
    if (state === 'failed') {
      this.onPeerFailed?.();
      this.endLocally('failed');
    }
  }

  private setConnectionUi(state: CallConnectionUiState): void {
    if (this.connectionUi === state) return;
    this.connectionUi = state;
    this.notify();
  }

  private clearDisconnectTimer(): void {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }

  private scheduleDisconnectEnd(): void {
    if (this.disconnectTimer) return;
    this.disconnectTimer = setTimeout(() => {
      this.disconnectTimer = null;
      if (this.pc?.connectionState === 'disconnected' || this.pc?.iceConnectionState === 'disconnected') {
        this.onPeerFailed?.();
        this.endLocally('disconnected');
      }
    }, 12_000);
  }

  private applyIceConnectionState(ice: RTCIceConnectionState): void {
    if (ice === 'connected' || ice === 'completed') {
      this.clearDisconnectTimer();
      this.setConnectionUi('good');
      if (this.phase === 'connecting') this.setPhase('connected');
    } else if (ice === 'checking' || ice === 'new') {
      this.setConnectionUi('connecting');
    } else if (ice === 'disconnected') {
      this.setConnectionUi('reconnecting');
      this.scheduleDisconnectEnd();
    } else if (ice === 'failed') {
      this.onPeerFailed?.();
      this.endLocally('failed');
    }
  }

  private async flushPendingIce(): Promise<void> {
    if (!this.pc) return;
    const queue = [...this.pendingIce];
    this.pendingIce = [];
    for (const init of queue) {
      try {
        await this.pc.addIceCandidate(init);
      } catch {
        /* ignore */
      }
    }
  }
}

export const callManager = new CallManager();
