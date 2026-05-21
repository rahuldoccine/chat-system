import axios, { type InternalAxiosRequestConfig } from 'axios';
import { env } from '../config/env';
import {
  clearAccessToken,
  getAccessToken,
  isSkipRefreshUrl,
  refreshAccessToken,
  setAccessToken,
} from './authSession';

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const api = axios.create({
  baseURL: env.apiUrl,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as RetryConfig | undefined;
    const status = error.response?.status;

    if (status !== 401 || !original) {
      return Promise.reject(error);
    }

    const requestUrl = original.url ?? '';

    if (original._retry || isSkipRefreshUrl(requestUrl)) {
      return Promise.reject(error);
    }

    original._retry = true;

    try {
      const { accessToken } = await refreshAccessToken();
      setAccessToken(accessToken);
      original.headers = original.headers ?? {};
      original.headers.Authorization = `Bearer ${accessToken}`;
      return api(original);
    } catch {
      clearAccessToken();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
  },
);

export default api;
