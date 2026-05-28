/**
 * E2EE group call media (Phase 5): distribute a per-session media key via GROUP_V1
 * chat messages. Browser Insertable Streams / SFrame wiring is environment-specific.
 */
export type GroupCallMediaKey = {
  sessionId: string;
  keyB64: string;
};

export function placeholderGroupCallE2eeEnabled(): boolean {
  return typeof RTCRtpSender !== 'undefined' && 'createEncodedStreams' in RTCRtpSender.prototype;
}
