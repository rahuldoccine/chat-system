import { describe, expect, it } from 'vitest';
import {
  isGroupDmE2eeMessage,
  parseRecipientCiphertexts,
  resolveViewerCiphertext,
} from './groupDmChat';

describe('groupDmChat helpers', () => {
  it('detects group dm-v1 fan-out messages', () => {
    expect(
      isGroupDmE2eeMessage({
        contentMeta: {
          e2eeVersion: 'dm-v1',
          recipientCiphertexts: { u2: 'envelope-b64' },
        },
      }),
    ).toBe(true);
    expect(
      isGroupDmE2eeMessage({
        contentMeta: { e2eeVersion: 'group-v1', epoch: 0 },
      }),
    ).toBe(false);
  });

  it('resolves viewer-specific ciphertext', () => {
    const msg = {
      ciphertext: 'fallback',
      contentMeta: {
        recipientCiphertexts: { alice: 'for-alice', bob: 'for-bob' },
      },
    };
    expect(resolveViewerCiphertext(msg, 'alice')).toBe('for-alice');
    expect(resolveViewerCiphertext(msg, 'bob')).toBe('for-bob');
    expect(resolveViewerCiphertext(msg, 'carol')).toBe('fallback');
  });

  it('parseRecipientCiphertexts ignores empty entries', () => {
    expect(
      parseRecipientCiphertexts({
        recipientCiphertexts: { a: '', b: 'ok' },
      }),
    ).toEqual({ b: 'ok' });
  });
});
