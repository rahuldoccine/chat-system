import React from 'react';
import { useCall } from '../CallProvider';
import type { CallMeta, OutgoingPreview } from '../types';
import IncomingCallModal from './IncomingCallModal';
import CallOverlay from './CallOverlay';
import CallErrorBanner from './CallErrorBanner';

function overlayMetaFromPreview(preview: OutgoingPreview): CallMeta {
  return {
    callId: '',
    chatId: preview.chatId,
    peerUserId: preview.peerUserId,
    peerDisplayName: preview.peerDisplayName,
    isVideo: preview.isVideo,
    isInitiator: true,
  };
}

const CallShell: React.FC = () => {
  const {
    phase,
    meta,
    outgoingPreview,
    pendingIncoming,
    localStream,
    remoteStream,
    error,
    connectedAt,
    remotePeerMuted,
    acceptIncoming,
    rejectIncoming,
    hangUp,
    toggleMute,
    toggleCamera,
    switchCamera,
    clearError,
  } = useCall();

  if (pendingIncoming && phase === 'ringing_in') {
    return (
      <>
        {error && <CallErrorBanner message={error} onDismiss={clearError} />}
        <IncomingCallModal
          peerName={pendingIncoming.peerDisplayName}
          peerUserId={pendingIncoming.fromUserId}
          peerAvatarUrl={pendingIncoming.peerAvatarUrl}
          isVideo={Boolean(pendingIncoming.media?.video)}
          onAccept={() => void acceptIncoming()}
          onDecline={() => void rejectIncoming()}
        />
      </>
    );
  }

  const showOverlay =
    phase === 'ringing_out' ||
    phase === 'connecting' ||
    phase === 'connected';

  const overlayMeta: CallMeta | null =
    meta ?? (outgoingPreview && showOverlay ? overlayMetaFromPreview(outgoingPreview) : null);

  if (!showOverlay || !overlayMeta) {
    return error ? <CallErrorBanner message={error} onDismiss={clearError} /> : null;
  }

  const statusLabel =
    phase === 'ringing_out'
      ? 'Calling…'
      : phase === 'connecting'
        ? 'Connecting…'
        : 'Ongoing';

  return (
    <>
      {error && <CallErrorBanner message={error} onDismiss={clearError} />}
      <CallOverlay
        peerUserId={overlayMeta.peerUserId}
        peerName={overlayMeta.peerDisplayName}
        peerAvatarUrl={overlayMeta.peerAvatarUrl}
        statusLabel={statusLabel}
        isVideo={overlayMeta.isVideo}
        callId={meta?.callId ?? null}
        connectedAt={connectedAt ?? meta?.connectedAt ?? null}
        remotePeerMuted={remotePeerMuted}
        localStream={localStream}
        remoteStream={remoteStream}
        onHangUp={() => void hangUp()}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
        onSwitchCamera={switchCamera}
      />
    </>
  );
};

export default CallShell;
