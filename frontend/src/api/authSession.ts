import axios from 'axios';
import { env } from '../config/env';

const ACCESS_TOKEN_KEY = 'auth_token';

export const AUTH_SKIP_REFRESH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
] as const;

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

/** True when a 401 should not trigger refresh (auth endpoints). */
export function isSkipRefreshUrl(url: string | undefined): boolean {
  if (!url) return false;
  return AUTH_SKIP_REFRESH_PATHS.some((path) => url.includes(path));
}

export type RefreshResult = {
  accessToken: string;
  expiresIn: number;
};

let refreshPromise: Promise<RefreshResult> | null = null;

/**
 * Exchange httpOnly refresh cookie for a new access token.
 * Uses a bare axios instance (no interceptors) to avoid refresh loops.
 */
export async function refreshAccessToken(): Promise<RefreshResult> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = axios
    .post<{ accessToken: string; expiresIn: number }>(
      `${env.apiUrl}/auth/refresh`,
      {},
      { withCredentials: true },
    )
    .then((res) => ({
      accessToken: res.data.accessToken,
      expiresIn: res.data.expiresIn,
    }))
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}
