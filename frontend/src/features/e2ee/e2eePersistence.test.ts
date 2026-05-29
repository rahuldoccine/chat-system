import { describe, expect, it } from 'vitest';

import {
  BACKUP_PAYLOAD_VERSION,
  parseBackupPayloadJson,
} from './backupPayload';
import type { E2eeKeyMaterial } from './keyStore';

const sampleMaterial: E2eeKeyMaterial = {
  userId: 'user-1',
  identityPrivateJwk: { kty: 'EC' },
  identityPublicSpki: 'id-pub',
  devicePrivateJwk: { kty: 'EC' },
  devicePublicSpki: 'dev-pub',
  signingPrivateJwk: { kty: 'EC' },
  signedPreKeys: [{ keyId: 'spk-1', privateJwk: { kty: 'EC' }, publicSpki: 'spk-pub' }],
  oneTimePreKeys: [],
};

describe('parseBackupPayloadJson', () => {
  it('parses v2 payload with auxiliary stores', () => {
    const json = JSON.stringify({
      version: BACKUP_PAYLOAD_VERSION,
      keyMaterial: sampleMaterial,
      deviceId: 'dev-abc',
      sentPlaintext: {
        'user-1:m:msg-1': { text: 'hello' },
      },
      groupSenderKeys: [
        { chatId: 'c1', senderId: 'user-1', epoch: 0, keyB64: 'AQID' },
      ],
    });

    const restored = parseBackupPayloadJson('user-1', json);
    expect(restored.material.identityPublicSpki).toBe('id-pub');
    expect(restored.sentPlaintext['user-1:m:msg-1']?.text).toBe('hello');
    expect(restored.groupSenderKeys).toHaveLength(1);
  });

  it('supports legacy key-material-only JSON', () => {
    const restored = parseBackupPayloadJson('user-1', JSON.stringify(sampleMaterial));
    expect(restored.material.userId).toBe('user-1');
    expect(restored.sentPlaintext).toEqual({});
    expect(restored.groupSenderKeys).toEqual([]);
  });
});

describe('group distribution v2 shape', () => {
  it('serializes wrapped distribution envelope', () => {
    const distribution = JSON.stringify({
      v: 2,
      self: { key: 'AQID', epoch: 0 },
      wrapped: { 'peer-1': 'cipher-text' },
    });
    const parsed = JSON.parse(distribution) as {
      v: number;
      self: { key: string };
      wrapped: Record<string, string>;
    };
    expect(parsed.v).toBe(2);
    expect(parsed.self.key).toBe('AQID');
    expect(parsed.wrapped['peer-1']).toBe('cipher-text');
  });
});
