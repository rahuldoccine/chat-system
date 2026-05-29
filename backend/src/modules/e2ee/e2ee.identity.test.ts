import { beforeEach, describe, expect, it, vi } from 'vitest';

import { upsertIdentityKey } from './e2ee.service.js';

const userIdentityKey = {
  findUnique: vi.fn(),
  upsert: vi.fn(),
};

const prisma = {
  userIdentityKey,
};

vi.mock('../../lib/prisma.js', () => ({
  getPrisma: () => prisma,
}));

describe('upsertIdentityKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects fingerprint overwrite without rotation', async () => {
    userIdentityKey.findUnique.mockResolvedValueOnce({
      fingerprint: 'existing-fp',
      revokedAt: null,
    });

    await expect(
      upsertIdentityKey('u1', { publicKey: 'pk', fingerprint: 'new-fp' }),
    ).rejects.toMatchObject({
      httpStatus: 409,
      code: 'IDENTITY_EXISTS',
    });

    expect(userIdentityKey.upsert).not.toHaveBeenCalled();
  });

  it('allows same fingerprint upsert', async () => {
    userIdentityKey.findUnique.mockResolvedValueOnce({
      fingerprint: 'same-fp',
      revokedAt: null,
    });
    userIdentityKey.upsert.mockResolvedValueOnce({
      userId: 'u1',
      fingerprint: 'same-fp',
      updatedAt: new Date(),
    });

    const row = await upsertIdentityKey('u1', { publicKey: 'pk', fingerprint: 'same-fp' });
    expect(row.fingerprint).toBe('same-fp');
    expect(userIdentityKey.upsert).toHaveBeenCalledOnce();
  });

  it('allows fingerprint rotation when explicitly requested', async () => {
    userIdentityKey.findUnique.mockResolvedValueOnce({
      fingerprint: 'old-fp',
      revokedAt: null,
    });
    userIdentityKey.upsert.mockResolvedValueOnce({
      userId: 'u1',
      fingerprint: 'new-fp',
      updatedAt: new Date(),
    });

    const row = await upsertIdentityKey(
      'u1',
      { publicKey: 'pk', fingerprint: 'new-fp' },
      { allowRotation: true },
    );
    expect(row.fingerprint).toBe('new-fp');
  });
});
