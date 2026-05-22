import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  getRememberedPeerDevice,
  orderedPeerDeviceIds,
  pickPeerDeviceId,
  rememberPeerDevice,
} from './peerDevice';
import type { DeviceRow } from './e2eeApi';

function mockLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    key: (i: number) => [...map.keys()][i] ?? null,
  } as Storage;
}

describe('peerDevice', () => {
  const peerId = 'peer-user-1';

  beforeEach(() => {
    vi.stubGlobal('localStorage', mockLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers remembered device when it is also the newest', () => {
    rememberPeerDevice(peerId, 'device-new');
    const devices: DeviceRow[] = [
      { deviceId: 'device-old', publicKey: 'a', label: null, updatedAt: '2020-01-01T00:00:00Z' },
      { deviceId: 'device-new', publicKey: 'b', label: null, updatedAt: '2026-01-01T00:00:00Z' },
    ];
    expect(pickPeerDeviceId(peerId, devices)).toBe('device-new');
  });

  it('uses newest device when remembered device is stale', () => {
    rememberPeerDevice(peerId, 'device-old');
    const devices: DeviceRow[] = [
      { deviceId: 'device-old', publicKey: 'a', label: null, updatedAt: '2020-01-01T00:00:00Z' },
      { deviceId: 'device-new', publicKey: 'b', label: null, updatedAt: '2026-05-01T00:00:00Z' },
    ];
    expect(pickPeerDeviceId(peerId, devices)).toBe('device-new');
  });

  it('ignores stale preferDeviceId when it is not the newest device', () => {
    const devices: DeviceRow[] = [
      { deviceId: 'device-old', publicKey: 'a', label: null, updatedAt: '2026-05-01T00:00:00Z' },
      { deviceId: 'device-incognito', publicKey: 'b', label: null, updatedAt: '2026-04-01T00:00:00Z' },
    ];
    expect(
      pickPeerDeviceId(peerId, devices, { preferDeviceId: 'device-incognito' }),
    ).toBe('device-old');
  });

  it('orders devices with primary first for bundle fetch', () => {
    const devices: DeviceRow[] = [
      { deviceId: 'device-old', publicKey: 'a', label: null, updatedAt: '2020-01-01T00:00:00Z' },
      { deviceId: 'device-new', publicKey: 'b', label: null, updatedAt: '2026-05-01T00:00:00Z' },
    ];
    expect(orderedPeerDeviceIds(peerId, devices)).toEqual(['device-new', 'device-old']);
  });

  it('falls back to newest device when nothing remembered', () => {
    const devices: DeviceRow[] = [
      { deviceId: 'device-old', publicKey: 'a', label: null, updatedAt: '2020-01-01T00:00:00Z' },
      { deviceId: 'device-new', publicKey: 'b', label: null, updatedAt: '2026-05-01T00:00:00Z' },
    ];
    expect(pickPeerDeviceId(peerId, devices)).toBe('device-new');
  });

  it('ignores stale remembered device not in list', () => {
    rememberPeerDevice(peerId, 'device-gone');
    const devices: DeviceRow[] = [
      { deviceId: 'device-only', publicKey: 'a', label: null, updatedAt: '2026-01-01T00:00:00Z' },
    ];
    expect(pickPeerDeviceId(peerId, devices)).toBe('device-only');
    expect(getRememberedPeerDevice(peerId)).toBe('device-gone');
  });
});
