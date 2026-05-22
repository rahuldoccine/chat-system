/**
 * Cryptographic round-trip (no network): same paths as directChat encrypt/decrypt.
 */
import { describe, expect, it } from 'vitest';
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  deriveAesGcmKey,
  ecdhSharedSecret,
  exportPublicKeySpki,
  generateEcdhKeyPair,
} from './crypto';
import { encodeEnvelope, encodePayload, decodeEnvelope, decodePayload } from './protocol';

describe('e2ee dm-v1 roundtrip', () => {
  it('encrypts and decrypts with matching spk and fingerprint salt', async () => {
    const senderIdentity = await generateEcdhKeyPair();
    const recipientSpk = await generateEcdhKeyPair();
    const ephemeral = await generateEcdhKeyPair();

    const senderFp = 'fp-sender-test';
    const spkId = 'spk-test-1';

    const sharedSend = await ecdhSharedSecret(ephemeral.privateKey, await exportPublicKeySpki(recipientSpk.publicKey));
    const aesSend = await deriveAesGcmKey(sharedSend, `${senderFp}:${spkId}`);

    const plainText = 'hi';
    const { iv, ct } = await aesGcmEncrypt(aesSend, encodePayload({ text: plainText }));

    const envelope = encodeEnvelope({
      v: 'dm-v1',
      iv,
      ct,
      ephemPub: await exportPublicKeySpki(ephemeral.publicKey),
      spkId,
    });

    const decoded = decodeEnvelope(envelope);
    expect(decoded).not.toBeNull();

    const sharedRecv = await ecdhSharedSecret(
      recipientSpk.privateKey,
      decoded!.ephemPub,
    );
    const aesRecv = await deriveAesGcmKey(sharedRecv, `${senderFp}:${decoded!.spkId}`);
    const plainBuf = await aesGcmDecrypt(aesRecv, decoded!.iv, decoded!.ct);
    const payload = decodePayload(plainBuf);
    expect(payload?.text).toBe(plainText);
  });
});
