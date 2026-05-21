import { describe, expect, it } from 'vitest';
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  deriveAesGcmKey,
  ecdhSharedSecret,
  exportPublicKeySpki,
  generateEcdhKeyPair,
} from './crypto';
import { encodeEnvelope, decodeEnvelope, encodePayload, decodePayload, E2EE_VERSION } from './protocol';

describe('e2ee crypto round-trip', () => {
  it('encrypts and decrypts when HKDF salt uses sender fingerprint', async () => {
    const bob = await generateEcdhKeyPair();
    const bobPub = await exportPublicKeySpki(bob.publicKey);
    const senderFp = 'sender-identity-fp';
    const spkId = 'spk-1';

    const ephemeral = await generateEcdhKeyPair();
    const encryptShared = await ecdhSharedSecret(ephemeral.privateKey, bobPub);
    const encryptKey = await deriveAesGcmKey(encryptShared, `${senderFp}:${spkId}`);

    const payload = encodePayload({ text: 'hello e2ee', meta: { foo: 'bar' } });
    const { iv, ct } = await aesGcmEncrypt(encryptKey, payload);

    const envelope = encodeEnvelope({
      v: E2EE_VERSION,
      iv,
      ct,
      ephemPub: await exportPublicKeySpki(ephemeral.publicKey),
      spkId,
    });

    const parsed = decodeEnvelope(envelope)!;
    const decryptShared = await ecdhSharedSecret(bob.privateKey, parsed.ephemPub);
    const decryptKey = await deriveAesGcmKey(decryptShared, `${senderFp}:${spkId}`);
    const plain = await aesGcmDecrypt(decryptKey, parsed.iv, parsed.ct);
    const decoded = decodePayload(plain);
    expect(decoded?.text).toBe('hello e2ee');

    const wrongKey = await deriveAesGcmKey(decryptShared, `recipient-fp:${spkId}`);
    await expect(aesGcmDecrypt(wrongKey, parsed.iv, parsed.ct)).rejects.toThrow();
  });
});
