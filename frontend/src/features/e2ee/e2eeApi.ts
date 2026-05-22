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

function unwrap<T>(payload: ApiOk<T> | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as ApiOk<T>).data;
  }
  return payload as T;
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
    version: 1,
    wrapAlg,
    wrappedPrivateKeyMaterial,
  });
}

export async function getAccountKeyBackupStatus(): Promise<{ hasBackup: boolean }> {
  const res = await api.get<ApiOk<{ hasBackup: boolean }>>('/e2ee/backup/status');
  return unwrap(res.data);
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
