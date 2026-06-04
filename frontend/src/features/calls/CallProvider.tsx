import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketService } from '../../services/socket';
import { callManager } from './CallManager';
import {
  emitCallAnswer,
  emitCallEnd,
  emitCallIce,
  emitCallOffer,
  emitCallReject,
  emitCallSignal,
} from './callSignaling';
import type { Chat } from '../chat/types';
import type {
  CallIcePayload,
  CallMeta,
  CallPhase,
  IncomingCallPayload,
  OutgoingPreview,
} from './types';
import { friendlySocketAckMessage } from '../../utils/userFriendlyErrors';
import { formatMediaError } from './mediaErrors';
import CallShell from './components/CallShell';

type PendingIncoming = IncomingCallPayload & {
  peerDisplayName: string;
  peerAvatarUrl: string | null;
};

type CallContextValue = {
  phase: CallPhase;
  meta: CallMeta | null;
  outgoingPreview: OutgoingPreview | null;
  isStarting: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  pendingIncoming: PendingIncoming | null;
  error: string | null;
  startCall: (opts: { chatId: string; peerUserId: string; peerDisplayName: string; video: boolean }) => Promise<void>;
  acceptIncoming: () => Promise<void>;
  rejectIncoming: () => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMute: () => boolean;
  toggleCamera: () => boolean;
  switchCamera: () => Promise<boolean>;
  remotePeerMuted: boolean;
  connectedAt: number | null;
  peerRinging: boolean;
  connectionUi: import('./CallManager').CallConnectionUiState;
  clearError: () => void;
};

const CallContext = createContext<CallContextValue | undefined>(undefined);

function resolvePeerInfo(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  chatId?: string,
): { name: string; avatarUrl: string | null } {
  const data = queryClient.getQueryData<{ data?: Chat[] }>(['conversations']);
  const chats = data?.data ?? [];
  for (const chat of chats) {
    if (chatId && chat.id === chatId && chat.dmPeer?.id === userId) {
      return {
        name: chat.dmPeer.displayName || chat.dmPeer.email || 'Contact',
        avatarUrl: chat.dmPeer.avatarUrl ?? null,
      };
    }
    if (chat.dmPeer?.id === userId) {
      return {
        name: chat.dmPeer.displayName || chat.dmPeer.email || 'Contact',
        avatarUrl: chat.dmPeer.avatarUrl ?? null,
      };
    }
  }
  return { name: 'Contact', avatarUrl: null };
}

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [tick, setTick] = useState(0);
  const [pendingIncoming, setPendingIncoming] = useState<PendingIncoming | null>(null);
  const [outgoingPreview, setOutgoingPreview] = useState<OutgoingPreview | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remotePeerMuted, setRemotePeerMuted] = useState(false);
  const [peerRinging, setPeerRinging] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const remoteSdpRef = useRef<string | null>(null);
  const startingRef = useRef(false);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    return callManager.subscribe(refresh);
  }, [refresh]);

  useEffect(() => {
    callManager.setIceEmitter((payload) => emitCallIce(payload));
    callManager.setPeerFailedHandler(() => {
      const meta = callManager.getMeta();
      if (meta?.callId) void emitCallEnd(meta.callId, 'network_lost');
    });
    return () => {
      callManager.setIceEmitter(null);
      callManager.setPeerFailedHandler(null);
    };
  }, []);

  const handleEnded = useCallback((reason?: string) => {
    callManager.endLocally(reason);
    setPendingIncoming(null);
    setOutgoingPreview(null);
    remoteSdpRef.current = null;
    startingRef.current = false;
    setIsStarting(false);
    setConnectedAt(null);
    setRemotePeerMuted(false);
    setPeerRinging(false);
    void queryClient.invalidateQueries({ queryKey: ['calls'] });
    void queryClient.invalidateQueries({ queryKey: ['messages'] });
    refresh();
  }, [refresh, queryClient]);

  useEffect(() => {
    const onIncoming = (payload: IncomingCallPayload) => {
      if (callManager.isBusy()) {
        setError('You are already in a call. End it before answering another.');
        refresh();
        return;
      }
      const peer = resolvePeerInfo(queryClient, payload.fromUserId, payload.chatId);
      const peerDisplayName = peer.name;
      remoteSdpRef.current = payload.sdp;
      setPendingIncoming({ ...payload, peerDisplayName, peerAvatarUrl: peer.avatarUrl });
      callManager.stageIncoming({
        callId: payload.callId,
        chatId: payload.chatId,
        peerUserId: payload.fromUserId,
        peerDisplayName,
        peerAvatarUrl: peer.avatarUrl,
        isVideo: Boolean(payload.media?.video),
        isInitiator: false,
      });
      refresh();
    };

    const onBusy = () => {
      setError('This person is on another call. Try again in a few minutes.');
      handleEnded('busy');
    };

    const onSignal = (payload: { callId: string; signal: string }) => {
      const meta = callManager.getMeta();
      if (meta?.callId !== payload.callId) return;
      if (payload.signal === 'mute') setRemotePeerMuted(true);
      if (payload.signal === 'unmute') setRemotePeerMuted(false);
    };

    const onRinging = (payload: { callId: string }) => {
      const meta = callManager.getMeta();
      if (meta?.callId !== payload.callId) return;
      setPeerRinging(true);
    };

    const onAnswered = async (payload: { callId: string; sdp: string }) => {
      const meta = callManager.getMeta();
      if (meta?.callId !== payload.callId) return;
      setPeerRinging(false);
      try {
        await callManager.applyAnswer(payload.sdp);
        const ts = Date.now();
        setConnectedAt(ts);
        callManager.setConnectedAt(ts);
        refresh();
      } catch {
        setError("We couldn't connect the call. Please try again.");
        void emitCallEnd(payload.callId, 'error');
        handleEnded('error');
      }
    };

    const onIce = (payload: CallIcePayload) => {
      const meta = callManager.getMeta();
      if (meta?.callId !== payload.callId) return;
      void callManager.handleRemoteIce(payload);
    };

    const onRejected = (payload: { callId: string; reason?: string }) => {
      const meta = callManager.getMeta();
      if (meta?.callId !== payload.callId) return;
      setError(payload.reason === 'rejected' ? 'They declined the call' : 'The call was not accepted');
      handleEnded(payload.reason ?? 'rejected');
    };

    const onEnded = (payload: { callId: string; reason?: string }) => {
      const meta = callManager.getMeta();
      if (meta?.callId !== payload.callId) return;
      if (payload.reason === 'timeout') {
        setError('No one answered. Try again later.');
      }
      handleEnded(payload.reason ?? 'ended');
    };

    socketService.on('call:incoming', onIncoming);
    socketService.on('call:ringing', onRinging);
    socketService.on('call:answered', onAnswered);
    socketService.on('call:ice', onIce);
    socketService.on('call:rejected', onRejected);
    socketService.on('call:ended', onEnded);
    socketService.on('call:busy', onBusy);
    socketService.on('call:signal', onSignal);

    const onDisconnect = () => {
      if (callManager.isBusy()) {
        setError('You lost your internet connection. The call has ended.');
        const meta = callManager.getMeta();
        if (meta?.callId) void emitCallEnd(meta.callId, 'network_lost');
        handleEnded('network_lost');
      }
    };
    socketService.on('disconnect', onDisconnect);

    return () => {
      socketService.off('call:incoming', onIncoming);
      socketService.off('call:ringing', onRinging);
      socketService.off('call:answered', onAnswered);
      socketService.off('call:ice', onIce);
      socketService.off('call:rejected', onRejected);
      socketService.off('call:ended', onEnded);
      socketService.off('call:busy', onBusy);
      socketService.off('call:signal', onSignal);
      socketService.off('disconnect', onDisconnect);
    };
  }, [queryClient, handleEnded]);

  const startCall = useCallback(
    async (opts: { chatId: string; peerUserId: string; peerDisplayName: string; video: boolean }) => {
      if (callManager.isBusy() || startingRef.current) return;
      if (!socketService.isConnected()) {
        setError("You're offline. Wait until you're connected, then try again.");
        refresh();
        return;
      }
      startingRef.current = true;
      setIsStarting(true);
      setError(null);
      setOutgoingPreview({
        chatId: opts.chatId,
        peerUserId: opts.peerUserId,
        peerDisplayName: opts.peerDisplayName,
        isVideo: opts.video,
      });
      refresh();
      try {
        const { sdp, effectiveVideo } = await callManager.createOffer(opts.video);
        if (opts.video && !effectiveVideo) {
          setError('No camera was found. This call will continue as voice only.');
        }
        const ack = await emitCallOffer({
          chatId: opts.chatId,
          peerUserId: opts.peerUserId,
          sdp,
          media: { audio: true, video: opts.video },
          videoFallback: opts.video && !effectiveVideo,
        });
        if (!ack.ok || !ack.data?.callId) {
          callManager.cleanup();
          setOutgoingPreview(null);
          const msg = ack.ok
            ? "We couldn't start the call. Please try again."
            : friendlySocketAckMessage(ack.code, ack.message, "We couldn't start the call. Please try again.");
          setError(msg);
          return;
        }
        setOutgoingPreview(null);
        const peer = resolvePeerInfo(queryClient, opts.peerUserId, opts.chatId);
        callManager.setMeta({
          callId: ack.data.callId,
          chatId: opts.chatId,
          peerUserId: opts.peerUserId,
          peerDisplayName: opts.peerDisplayName || peer.name,
          peerAvatarUrl: peer.avatarUrl,
          isVideo: opts.video,
          isInitiator: true,
        });
      } catch (err) {
        callManager.cleanup();
        setOutgoingPreview(null);
        setError(formatMediaError(err, opts.video));
      } finally {
        startingRef.current = false;
        setIsStarting(false);
        refresh();
      }
    },
    [refresh],
  );

  const acceptIncoming = useCallback(async () => {
    if (!pendingIncoming || !remoteSdpRef.current) return;
    setError(null);
    const inc = pendingIncoming;
    setPendingIncoming(null);
    try {
      const wantsVideo = Boolean(inc.media?.video);
      const { sdp, effectiveVideo } = await callManager.createAnswer(
        remoteSdpRef.current,
        wantsVideo,
      );
      if (wantsVideo && !effectiveVideo) {
        setError('No camera was found. This call will continue as voice only.');
      }
      const ack = await emitCallAnswer({ callId: inc.callId, sdp });
      if (!ack.ok) {
        callManager.cleanup();
        setError(
          friendlySocketAckMessage(ack.code, ack.message, "We couldn't answer the call. Please try again."),
        );
        return;
      }
      const peer = resolvePeerInfo(queryClient, inc.fromUserId, inc.chatId);
      const ts = Date.now();
      setConnectedAt(ts);
      callManager.setMeta({
        callId: inc.callId,
        chatId: inc.chatId,
        peerUserId: inc.fromUserId,
        peerDisplayName: inc.peerDisplayName,
        peerAvatarUrl: peer.avatarUrl,
        isVideo: wantsVideo,
        isInitiator: false,
        connectedAt: ts,
      });
      remoteSdpRef.current = null;
    } catch (err) {
      callManager.cleanup();
      setError(formatMediaError(err, Boolean(inc.media?.video)));
      void emitCallReject(inc.callId);
    }
    refresh();
  }, [pendingIncoming, refresh]);

  const rejectIncoming = useCallback(async () => {
    if (!pendingIncoming) return;
    const callId = pendingIncoming.callId;
    setPendingIncoming(null);
    remoteSdpRef.current = null;
    callManager.cleanup();
    await emitCallReject(callId);
    refresh();
  }, [pendingIncoming, refresh]);

  const hangUp = useCallback(async () => {
    const meta = callManager.getMeta();
    if (meta?.callId) {
      if (callManager.getPhase() === 'ringing_in') {
        await emitCallReject(meta.callId);
      } else {
        await emitCallEnd(meta.callId);
      }
    }
    handleEnded('ended');
  }, [handleEnded]);

  const value = useMemo<CallContextValue>(
    () => ({
      phase: callManager.getPhase(),
      meta: callManager.getMeta(),
      outgoingPreview,
      isStarting,
      localStream: callManager.getLocalStream(),
      remoteStream: callManager.getRemoteStream(),
      pendingIncoming,
      error,
      startCall,
      acceptIncoming,
      rejectIncoming,
      hangUp,
      toggleMute: () => {
        const on = callManager.toggleMute();
        const meta = callManager.getMeta();
        if (meta?.callId) emitCallSignal(meta.callId, on ? 'unmute' : 'mute');
        return on;
      },
      toggleCamera: () => {
        const on = callManager.toggleCamera();
        const meta = callManager.getMeta();
        if (meta?.callId) emitCallSignal(meta.callId, on ? 'camera_on' : 'camera_off');
        return on;
      },
      switchCamera: () => callManager.switchCamera(),
      remotePeerMuted,
      connectedAt,
      peerRinging,
      connectionUi: callManager.getConnectionUi(),
      clearError: () => setError(null),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick drives manager-derived fields
    [
      tick,
      pendingIncoming,
      outgoingPreview,
      isStarting,
      error,
      remotePeerMuted,
      connectedAt,
      peerRinging,
      startCall,
      acceptIncoming,
      rejectIncoming,
      hangUp,
    ],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      <CallShell />
    </CallContext.Provider>
  );
};

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
