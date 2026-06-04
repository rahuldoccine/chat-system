/** Client DM E2EE protocol version stored in Message.contentMeta.e2eeVersion */
export const E2EE_VERSION = 'dm-v1';
export const GROUP_E2EE_VERSION = 'group-v1';

export type DmV1Envelope = {
  v: typeof E2EE_VERSION;
  iv: string;
  ct: string;
  ephemPub: string;
  spkId: string;
  otpkId?: string | null;
};

export type DmV1Payload = {
  text: string;
  meta?: Record<string, unknown>;
};

export type GroupV1Envelope = {
  v: typeof GROUP_E2EE_VERSION;
  senderId: string;
  epoch: number;
  iv: string;
  ct: string;
};

export function isE2eeMessage(msg: {
  contentMeta?: { e2eeVersion?: string } | null;
}): boolean {
  const v = msg.contentMeta?.e2eeVersion;
  return typeof v === 'string' && v.length > 0;
}

/** Legacy group-v1 sender-key messages (read-only decrypt). */
export function isGroupE2eeMessage(msg: {
  contentMeta?: { e2eeVersion?: string } | null;
}): boolean {
  return msg.contentMeta?.e2eeVersion === GROUP_E2EE_VERSION;
}

export function encodeGroupEnvelope(envelope: GroupV1Envelope): string {
  return btoa(JSON.stringify(envelope));
}

export function decodeGroupEnvelope(ciphertext: string): GroupV1Envelope | null {
  try {
    const raw = JSON.parse(atob(ciphertext)) as GroupV1Envelope;
    if (raw?.v !== GROUP_E2EE_VERSION || !raw.iv || !raw.ct || !raw.senderId) return null;
    return raw;
  } catch {
    return null;
  }
}

export function encodeEnvelope(envelope: DmV1Envelope): string {
  return btoa(JSON.stringify(envelope));
}

export function decodeEnvelope(ciphertext: string): DmV1Envelope | null {
  try {
    const raw = JSON.parse(atob(ciphertext)) as DmV1Envelope;
    if (raw?.v !== E2EE_VERSION || !raw.iv || !raw.ct || !raw.ephemPub || !raw.spkId) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export function encodePayload(payload: DmV1Payload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function decodePayload(bytes: ArrayBuffer): DmV1Payload | null {
  try {
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as DmV1Payload;
    if (typeof raw?.text !== 'string') return null;
    return raw;
  } catch {
    return null;
  }
}
