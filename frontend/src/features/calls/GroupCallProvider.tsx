import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { acquireUserMedia, formatMediaError } from './mediaErrors';
import {
  cameraFacingFromTrack,
  DEFAULT_CAMERA_FACING,
  switchVideoCamera,
  type CameraFacing,
} from './cameraSwitch';
import GroupCallOverlay from './components/GroupCallOverlay';
import GroupCallIncomingPrompt from './components/GroupCallIncomingPrompt';

type GroupCallState = {
  sessionId: string | null;
  chatId: string | null;
  kind: 'AUDIO' | 'VIDEO';
  participants: string[];
  localStream: MediaStream | null;
  startedAtMs: number | null;
};

type GroupCallContextValue = {
  state: GroupCallState;
  startGroupCall: (chatId: string, video?: boolean) => Promise<void>;
  joinGroupCall: (sessionId: string, chatId: string, video?: boolean) => Promise<void>;
  leaveGroupCall: () => void;
  toggleMute: () => boolean;
  toggleCamera: () => boolean;
  switchCamera: () => Promise<boolean>;
};

type StartAck = {
  ok?: boolean;
  data?: { sessionId: string; existing?: boolean; startedAt?: number };
};

const GroupCallContext = createContext<GroupCallContextValue | null>(null);

const INITIAL_STATE: GroupCallState = {
  sessionId: null,
  chatId: null,
  kind: 'AUDIO',
  participants: [],
  localStream: null,
  startedAtMs: null,
};

function stopLocalStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

function resolveStartedAtMs(
  startedAt: number | undefined,
  fallback: number | null,
): number | null {
  return typeof startedAt === 'number' ? startedAt : fallback;
}

function endGroupCallSession(state: GroupCallState, endedSessionId: string): GroupCallState {
  if (state.sessionId !== endedSessionId) return state;
  stopLocalStream(state.localStream);
  return {
    ...state,
    sessionId: null,
    participants: [],
    localStream: null,
    startedAtMs: null,
  };
}

function applyStartAck(
  ack: StartAck | undefined,
  userId: string,
  emitJoin: (sessionId: string) => void,
): (state: GroupCallState) => GroupCallState {
  return (s) => {
    if (!ack?.ok || !ack.data?.sessionId) return s;
    const sessionId = ack.data.sessionId;
    if (ack.data.existing) {
      emitJoin(sessionId);
    }
    return {
      ...s,
      sessionId,
      participants: [userId],
      startedAtMs: resolveStartedAtMs(ack.data.startedAt, s.startedAtMs),
    };
  };
}

export function GroupCallProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const [state, setState] = useState<GroupCallState>(INITIAL_STATE);
  const [dismissedIncomingSessionId, setDismissedIncomingSessionId] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>(DEFAULT_CAMERA_FACING);

  const leaveGroupCall = useCallback(() => {
    if (socket && state.sessionId) {
      socket.emit('groupCall:leave', { sessionId: state.sessionId });
    }
    stopLocalStream(state.localStream);
    setState(INITIAL_STATE);
  }, [socket, state.sessionId, state.localStream]);

  useEffect(() => {
    if (!socket) return;

    const onStarted = (p: {
      sessionId: string;
      chatId: string;
      kind: 'AUDIO' | 'VIDEO';
      startedAt?: number;
    }) => {
      setState((s) => ({
        ...s,
        sessionId: p.sessionId,
        chatId: p.chatId,
        kind: p.kind,
        startedAtMs: resolveStartedAtMs(p.startedAt, s.startedAtMs),
      }));
      setDismissedIncomingSessionId((prev) => (prev === p.sessionId ? null : prev));
    };

    const onUpdate = (p: { sessionId: string; participants: string[] }) => {
      setState((s) =>
        s.sessionId === p.sessionId ? { ...s, participants: p.participants } : s,
      );
    };

    const onEnded = (p: { sessionId: string }) => {
      setState((s) => endGroupCallSession(s, p.sessionId));
      setDismissedIncomingSessionId((prev) => (prev === p.sessionId ? null : prev));
    };

    socket.on('groupCall:started', onStarted);
    socket.on('groupCall:participantUpdate', onUpdate);
    socket.on('groupCall:ended', onEnded);
    return () => {
      socket.off('groupCall:started', onStarted);
      socket.off('groupCall:participantUpdate', onUpdate);
      socket.off('groupCall:ended', onEnded);
    };
  }, [socket]);

  const startGroupCall = useCallback(
    async (chatId: string, video = false) => {
      if (!socket || !user) return;
      try {
        const { stream, videoFallback } = await acquireUserMedia(video);
        if (video && videoFallback) {
          toast.info('No camera found. Video call will continue as voice on your side.');
        }
        const kind: 'AUDIO' | 'VIDEO' = video ? 'VIDEO' : 'AUDIO';
        const facing =
          stream.getVideoTracks()[0] != null
            ? (cameraFacingFromTrack(stream.getVideoTracks()[0]) ?? DEFAULT_CAMERA_FACING)
            : 'user';
        setCameraFacing(facing);
        setState((s) => ({ ...s, chatId, kind, localStream: stream }));
        socket.emit('groupCall:start', { chatId, kind }, (ack: StartAck) => {
          setState(applyStartAck(ack, user.id, (sessionId) => {
            socket.emit('groupCall:join', { sessionId });
          }));
        });
      } catch (err) {
        toast.error(formatMediaError(err, video));
      }
    },
    [socket, user],
  );

  const joinGroupCall = useCallback(
    async (sessionId: string, chatId: string, video = false) => {
      if (!socket || !user) return;
      try {
        const { stream, videoFallback } = await acquireUserMedia(video);
        if (video && videoFallback) {
          toast.info('No camera found. Joined as voice while staying in video call.');
        }
        const facing =
          stream.getVideoTracks()[0] != null
            ? (cameraFacingFromTrack(stream.getVideoTracks()[0]) ?? DEFAULT_CAMERA_FACING)
            : 'user';
        setCameraFacing(facing);
        setState((s) => ({
          ...s,
          sessionId,
          chatId,
          kind: video ? 'VIDEO' : s.kind,
          localStream: stream,
        }));
        setDismissedIncomingSessionId((prev) => (prev === sessionId ? null : prev));
        socket.emit('groupCall:join', { sessionId });
      } catch (err) {
        toast.error(formatMediaError(err, video));
      }
    },
    [socket, user],
  );

  const toggleMute = useCallback(() => {
    const track = state.localStream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    setState((s) => ({ ...s }));
    return track.enabled;
  }, [state.localStream]);

  const toggleCamera = useCallback(() => {
    const track = state.localStream?.getVideoTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    setState((s) => ({ ...s }));
    return track.enabled;
  }, [state.localStream]);

  const switchCamera = useCallback(async () => {
    const stream = state.localStream;
    if (!stream?.getVideoTracks()[0]) {
      toast.error('No camera available');
      return false;
    }
    const { ok, facing } = await switchVideoCamera(stream, cameraFacing, null);
    if (ok) {
      setCameraFacing(facing);
      setState((s) => ({ ...s }));
      return true;
    }
    toast.error(
      'Could not switch camera. On a phone, allow camera access; on a computer, connect another webcam or try again.',
    );
    return false;
  }, [state.localStream, cameraFacing]);

  const value = useMemo(
    () => ({
      state,
      startGroupCall,
      joinGroupCall,
      leaveGroupCall,
      toggleMute,
      toggleCamera,
      switchCamera,
    }),
    [state, startGroupCall, joinGroupCall, leaveGroupCall, toggleMute, toggleCamera, switchCamera],
  );

  const incomingSessionId = state.sessionId;
  const incomingChatId = state.chatId;
  const showIncoming =
    incomingSessionId &&
    incomingChatId &&
    !state.localStream &&
    dismissedIncomingSessionId !== incomingSessionId;

  return (
    <GroupCallContext.Provider value={value}>
      {children}
      {state.sessionId && state.chatId && state.localStream && (
        <GroupCallOverlay
          sessionId={state.sessionId}
          chatId={state.chatId}
          kind={state.kind}
          participants={state.participants}
          localStream={state.localStream}
          startedAtMs={state.startedAtMs}
          onLeave={leaveGroupCall}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onSwitchCamera={switchCamera}
          cameraFacing={cameraFacing}
        />
      )}
      {showIncoming && (
        <GroupCallIncomingPrompt
          kind={state.kind}
          participants={state.participants}
          onJoinVoice={() => {
            if (!incomingSessionId || !incomingChatId) return;
            void joinGroupCall(incomingSessionId, incomingChatId, false);
          }}
          onJoinVideo={() => {
            if (!incomingSessionId || !incomingChatId) return;
            void joinGroupCall(incomingSessionId, incomingChatId, true);
          }}
          onDismiss={() => setDismissedIncomingSessionId(incomingSessionId)}
        />
      )}
    </GroupCallContext.Provider>
  );
}

export function useGroupCall(): GroupCallContextValue {
  const ctx = useContext(GroupCallContext);
  if (!ctx) throw new Error('useGroupCall requires GroupCallProvider');
  return ctx;
}
