import { env } from '../../config/env';
import { socketService } from '../../services/socket';

const PROBE_TTL_MS = 2_000;
const PROBE_TIMEOUT_MS = 1_500;

let lastProbeAt = 0;
let lastProbeOk = true;
let networkDownFlag = false;

/** Browser reports online but DevTools → Offline often leaves this true. */
export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

export function isSocketConnected(): boolean {
  return socketService.isConnected();
}

export function setNetworkDown(down: boolean): void {
  networkDownFlag = down;
  if (!down) lastProbeOk = true;
}

/** Quick HEAD/GET probe — fails fast under DevTools Offline. */
export async function probeNetworkReachable(force = false): Promise<boolean> {
  if (isBrowserOffline()) {
    lastProbeOk = false;
    return false;
  }
  if (!force && Date.now() - lastProbeAt < PROBE_TTL_MS) {
    return lastProbeOk;
  }
  lastProbeAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    await fetch(`${env.apiUrl}/config/public`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    globalThis.clearTimeout(timer);
    lastProbeOk = true;
    networkDownFlag = false;
    return true;
  } catch {
    lastProbeOk = false;
    networkDownFlag = true;
    return false;
  }
}

export function isNetworkKnownDown(): boolean {
  return networkDownFlag || isBrowserOffline();
}

/** Sync hint only — prefer shouldQueueLocallyAsync before sending. */
export function shouldQueueLocally(): boolean {
  if (isNetworkKnownDown()) return true;
  if (isBrowserOffline()) return true;
  return !isSocketConnected();
}

/** Accurate for DevTools Offline and real offline. */
export async function shouldQueueLocallyAsync(): Promise<boolean> {
  if (isBrowserOffline()) return true;
  if (!isSocketConnected()) return true;
  if (networkDownFlag) return true;
  return !(await probeNetworkReachable());
}

/** Only attempt live delivery when socket is up and network probe succeeds. */
export async function canAttemptDelivery(): Promise<boolean> {
  if (isBrowserOffline()) return false;
  if (!isSocketConnected()) return false;
  return probeNetworkReachable();
}
