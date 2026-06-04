import React from 'react';
import { useCall } from '../CallProvider';
import IncomingCallModal from './IncomingCallModal';
import OutgoingCallModal from './OutgoingCallModal';
import CallOverlay from './CallOverlay';
import CallErrorBanner from './CallErrorBanner';
import { handler } from '../../../utils/asyncHandler';
import {
  callOutgoingStatusLabel,
  isIncomingCallRinging,
  resolveCallOverlayMeta,
} from './callShell.helpers';

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

  const incomingRinging = isIncomingCallRinging(phase, meta, Boolean(pendingIncoming));

  if (incomingRinging) {
    const peerName =
      pendingIncoming?.peerDisplayName ?? meta?.peerDisplayName ?? 'Contact';
    const peerUserId = pendingIncoming?.fromUserId ?? meta?.peerUserId;
    const peerAvatarUrl = pendingIncoming?.peerAvatarUrl ?? meta?.peerAvatarUrl;
    const isVideo = pendingIncoming
      ? Boolean(pendingIncoming.media?.video)
      : Boolean(meta?.isVideo);
    return (
      <>
        {error && <CallErrorBanner message={error} onDismiss={clearError} />}
        <IncomingCallModal
          peerName={peerName}
          peerUserId={peerUserId}
          peerAvatarUrl={peerAvatarUrl}
          isVideo={isVideo}
          onAccept={handler(acceptIncoming)}
          onDecline={handler(rejectIncoming)}
        />
      </>
    );
  }

  const overlayMeta = resolveCallOverlayMeta(meta, outgoingPreview, isStarting, phase);

  const showOutgoingCard =
    Boolean(overlayMeta) &&
    meta?.isInitiator !== false &&
    (isStarting || phase === 'ringing_out' || phase === 'connecting');

  const showActiveOverlay = phase === 'connected' && Boolean(meta ?? overlayMeta);

  if (!showOutgoingCard && !showActiveOverlay) {
    return error ? <CallErrorBanner message={error} onDismiss={clearError} /> : null;
  }

  const statusLabel = callOutgoingStatusLabel(isStarting, phase, peerRinging);

  const activeMeta = meta ?? overlayMeta;
  if (!activeMeta) {
    return error ? <CallErrorBanner message={error} onDismiss={clearError} /> : null;
  }

  return (
    <>
      {error && <CallErrorBanner message={error} onDismiss={clearError} />}
      {showOutgoingCard && overlayMeta && (
        <OutgoingCallModal
          peerName={overlayMeta.peerDisplayName}
          peerUserId={overlayMeta.peerUserId}
          peerAvatarUrl={overlayMeta.peerAvatarUrl}
          statusLabel={statusLabel}
          onCancel={handler(hangUp)}
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
          onHangUp={handler(hangUp)}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onSwitchCamera={switchCamera}
        />
      )}
    </>
  );
};

export default CallShell;
