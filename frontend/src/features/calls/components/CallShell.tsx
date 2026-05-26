import React from 'react';
import { useCall } from '../CallProvider';
import type { CallMeta, OutgoingPreview } from '../types';
import IncomingCallModal from './IncomingCallModal';
import OutgoingCallModal from './OutgoingCallModal';
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
    isStarting,
    pendingIncoming,
    localStream,
    remoteStream,
    error,
    connectedAt,
    remotePeerMuted,
    connectionUi,
    peerRinging,
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

  const overlayMeta: CallMeta | null =
    meta ??
    (outgoingPreview && (isStarting || phase === 'ringing_out' || phase === 'connecting')
      ? overlayMetaFromPreview(outgoingPreview)
      : null);

  const showOutgoingCard =
    Boolean(overlayMeta) &&
    (isStarting || phase === 'ringing_out' || phase === 'connecting');

  const showActiveOverlay = phase === 'connected' && Boolean(meta ?? overlayMeta);

  if (!showOutgoingCard && !showActiveOverlay) {
    return error ? <CallErrorBanner message={error} onDismiss={clearError} /> : null;
  }

  const statusLabel =
    isStarting
      ? 'Calling…'
      : phase === 'ringing_out'
        ? peerRinging
          ? 'Ringing…'
          : 'Calling…'
        : phase === 'connecting'
          ? 'Connecting…'
          : 'Ongoing';

  const activeMeta = meta ?? overlayMeta!;

  return (
    <>
      {error && <CallErrorBanner message={error} onDismiss={clearError} />}
      {showOutgoingCard && overlayMeta && (
        <OutgoingCallModal
          peerName={overlayMeta.peerDisplayName}
          peerUserId={overlayMeta.peerUserId}
          peerAvatarUrl={overlayMeta.peerAvatarUrl}
          statusLabel={statusLabel}
          onCancel={() => void hangUp()}
        />
      )}
      {showActiveOverlay && (
        <CallOverlay
          peerUserId={activeMeta.peerUserId}
          peerName={activeMeta.peerDisplayName}
          peerAvatarUrl={activeMeta.peerAvatarUrl}
          statusLabel="Ongoing"
          phase={phase}
          isVideo={activeMeta.isVideo}
          callId={meta?.callId ?? null}
          connectedAt={connectedAt ?? meta?.connectedAt ?? null}
          connectionUi={connectionUi}
          remotePeerMuted={remotePeerMuted}
          localStream={localStream}
          remoteStream={remoteStream}
          onHangUp={() => void hangUp()}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onSwitchCamera={switchCamera}
        />
      )}
    </>
  );
};

export default CallShell;
