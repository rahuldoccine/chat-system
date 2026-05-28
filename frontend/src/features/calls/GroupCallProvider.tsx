import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { acquireUserMedia, formatMediaError } from './mediaErrors';
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
};

const GroupCallContext = createContext<GroupCallContextValue | null>(null);

export function GroupCallProvider({ children }: { children: React.ReactNode }) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const [state, setState] = useState<GroupCallState>({
    sessionId: null,
    chatId: null,
    kind: 'AUDIO',
    participants: [],
    localStream: null,
    startedAtMs: null,
  });
  const [dismissedIncomingSessionId, setDismissedIncomingSessionId] = useState<string | null>(null);

  const leaveGroupCall = useCallback(() => {
    if (socket && state.sessionId) {
      socket.emit('groupCall:leave', { sessionId: state.sessionId });
    }
    state.localStream?.getTracks().forEach((t) => t.stop());
    setState({
      sessionId: null,
      chatId: null,
      kind: 'AUDIO',
      participants: [],
      localStream: null,
      startedAtMs: null,
    });
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
        startedAtMs: typeof p.startedAt === 'number' ? p.startedAt : s.startedAtMs,
      }));
      setDismissedIncomingSessionId((prev) => (prev === p.sessionId ? null : prev));
    };
    const onUpdate = (p: { sessionId: string; participants: string[] }) => {
      setState((s) =>
        s.sessionId === p.sessionId ? { ...s, participants: p.participants } : s,
      );
    };
    const onEnded = (p: { sessionId: string }) => {
      setState((s) => {
        if (s.sessionId !== p.sessionId) return s;
        s.localStream?.getTracks().forEach((t) => t.stop());
        return { ...s, sessionId: null, participants: [], localStream: null, startedAtMs: null };
      });
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
        setState((s) => ({ ...s, chatId, kind, localStream: stream }));
      socket.emit(
        'groupCall:start',
        { chatId, kind },
        (ack: { ok?: boolean; data?: { sessionId: string; existing?: boolean; startedAt?: number } }) => {
          if (ack?.ok && ack.data?.sessionId) {
            const sessionId = ack.data.sessionId;
            setState((s) => ({
              ...s,
              sessionId,
              participants: [user.id],
              startedAtMs:
                typeof ack.data?.startedAt === 'number' ? ack.data.startedAt : s.startedAtMs,
            }));
            // A call already existed for this group: join that same session.
            if (ack.data.existing) {
              socket.emit('groupCall:join', { sessionId });
            }
          }
        },
      );
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

  const value = useMemo(
    () => ({ state, startGroupCall, joinGroupCall, leaveGroupCall, toggleMute, toggleCamera }),
    [state, startGroupCall, joinGroupCall, leaveGroupCall, toggleMute, toggleCamera],
  );

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
        />
      )}
      {state.sessionId &&
        state.chatId &&
        !state.localStream &&
        dismissedIncomingSessionId !== state.sessionId && (
          <GroupCallIncomingPrompt
            kind={state.kind}
            participants={state.participants}
            onJoinVoice={() => void joinGroupCall(state.sessionId!, state.chatId!, false)}
            onJoinVideo={() => void joinGroupCall(state.sessionId!, state.chatId!, true)}
            onDismiss={() => setDismissedIncomingSessionId(state.sessionId)}
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
