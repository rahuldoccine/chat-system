import api from '../../api/axios';

export type PreKeyBundle = {
  identityKey: { publicKey: string; fingerprint: string };
  deviceKey: { deviceId: string; publicKey: string; label: string | null };
  signedPreKey: { keyId: string; publicKey: string; signature: string };
  oneTimePreKey: { keyId: string; publicKey: string } | null;
};

export type DeviceRow = {
  deviceId: string;
  publicKey: string;
  label: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type ApiOk<T> = { ok?: boolean; data: T };

function isApiOk<T>(payload: unknown): payload is ApiOk<T> {
  return Boolean(payload && typeof payload === 'object' && 'data' in payload);
}

function unwrap<T>(payload: ApiOk<T> | T): T {
  if (isApiOk<T>(payload)) {
    return payload.data;
  }
  return payload;
}

export async function putIdentityKey(publicKey: string, fingerprint: string): Promise<void> {
  await api.put('/e2ee/identity', { publicKey, fingerprint });
}

export async function getIdentityKey(userId: string): Promise<{
  publicKey: string;
  fingerprint: string;
}> {
  const res = await api.get<ApiOk<{ publicKey: string; fingerprint: string }>>(
    `/e2ee/identity/${userId}`,
  );
  return unwrap(res.data);
}

export async function putDeviceKey(
  deviceId: string,
  publicKey: string,
  label?: string,
): Promise<void> {
  await api.put(`/e2ee/devices/${deviceId}`, { publicKey, label });
}

export async function listPeerDevices(userId: string): Promise<DeviceRow[]> {
  const res = await api.get<ApiOk<DeviceRow[]>>(`/e2ee/devices/${userId}`);
  return unwrap(res.data);
}

export async function postPreKeys(
  deviceId: string,
  body: {
    signedPreKey: { keyId: string; publicKey: string; signature: string };
    oneTimePreKeys: { keyId: string; publicKey: string }[];
  },
): Promise<void> {
  await api.post(`/e2ee/prekeys/${deviceId}`, body);
}

export async function fetchPreKeyBundle(
  userId: string,
  deviceId: string,
): Promise<PreKeyBundle> {
  const res = await api.get<ApiOk<PreKeyBundle>>(`/e2ee/prekeys/${userId}/${deviceId}`);
  return unwrap(res.data);
}

export async function putKeyBackup(
  wrapAlg: string,
  wrappedPrivateKeyMaterial: string,
): Promise<void> {
  await api.put('/e2ee/backup', {
    version: 2,
    wrapAlg,
    wrappedPrivateKeyMaterial,
  });
}

export async function getAccountKeyBackupStatus(): Promise<{
  hasBackup: boolean;
  hasIdentityKey: boolean;
  identityFingerprint: string | null;
  deviceCount: number;
  backupUpdatedAt: string | null;
}> {
  const res = await api.get<
    ApiOk<{
      hasBackup: boolean;
      hasIdentityKey: boolean;
      identityFingerprint: string | null;
      deviceCount: number;
      backupUpdatedAt: string | null;
    }>
  >('/e2ee/backup/status');
  const data = unwrap(res.data);
  return {
    hasBackup: Boolean(data.hasBackup),
    hasIdentityKey: Boolean(data.hasIdentityKey),
    identityFingerprint: data.identityFingerprint ?? null,
    deviceCount: data.deviceCount ?? 0,
    backupUpdatedAt: data.backupUpdatedAt ?? null,
  };
}

/** Session-authenticated fetch of own wrapped keys (login restore). */
export async function getAccountKeyBackup(): Promise<{
  wrapAlg: string;
  wrappedPrivateKeyMaterial: string;
}> {
  const res = await api.get<ApiOk<{ wrapAlg: string; wrappedPrivateKeyMaterial: string }>>(
    '/e2ee/backup/account',
  );
  return unwrap(res.data);
}

export async function postRecoveryEmailChallenge(): Promise<void> {
  await api.post('/e2ee/recovery/challenge/email');
}

export async function postRecoveryEmailVerify(code: string): Promise<{ stepUpToken: string }> {
  const res = await api.post<ApiOk<{ stepUpToken: string }>>('/e2ee/recovery/verify/email', {
    code,
  });
  return unwrap(res.data);
}

export async function getKeyBackup(stepUpToken: string): Promise<{
  wrapAlg: string;
  wrappedPrivateKeyMaterial: string;
}> {
  const res = await api.get<ApiOk<{ wrapAlg: string; wrappedPrivateKeyMaterial: string }>>(
    '/e2ee/backup',
    {
      headers: { 'x-step-up-token': stepUpToken },
    },
  );
  return unwrap(res.data);
}
