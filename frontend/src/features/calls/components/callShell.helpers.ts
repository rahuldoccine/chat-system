import type { CallMeta, CallPhase, OutgoingPreview } from '../types';

export function overlayMetaFromPreview(preview: OutgoingPreview): CallMeta {
  return {
    callId: '',
    chatId: preview.chatId,
    peerUserId: preview.peerUserId,
    peerDisplayName: preview.peerDisplayName,
    isVideo: preview.isVideo,
    isInitiator: true,
  };
}

export function resolveCallOverlayMeta(
  meta: CallMeta | null,
  outgoingPreview: OutgoingPreview | null | undefined,
  isStarting: boolean,
  phase: string,
): CallMeta | null {
  if (meta) return meta;
  if (!outgoingPreview) return null;
  if (isStarting || phase === 'ringing_out' || phase === 'connecting') {
    return overlayMetaFromPreview(outgoingPreview);
  }
  return null;
}

/** Callee is ringing — show Accept / Decline, not the outgoing "Calling…" card. */
export function isIncomingCallRinging(
  phase: CallPhase,
  meta: CallMeta | null,
  hasPendingIncoming: boolean,
): boolean {
  if (phase !== 'ringing_in') return false;
  if (hasPendingIncoming) return true;
  return Boolean(meta && meta.isInitiator === false);
}

export function callOutgoingStatusLabel(
  isStarting: boolean,
  phase: string,
  peerRinging: boolean,
): string {
  if (isStarting) return 'Calling…';
  if (phase === 'ringing_out') return peerRinging ? 'Ringing…' : 'Calling…';
  if (phase === 'connecting') return 'Connecting…';
  return 'Ongoing';
}
