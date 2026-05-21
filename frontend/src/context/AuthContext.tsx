import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../api/axios';
import {
  clearAccessToken,
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
} from '../api/authSession';
import { unregisterWebPush } from '../services/push';
import { ensureE2eeReady } from '../features/e2ee/bootstrap';

interface User {
  id: string;
  name?: string;
  email: string;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (user: unknown, token: string) => void;
  applyProfile: (profile: {
    id: string;
    email: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  }) => void;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapApiUser(userData: {
  sub?: string;
  id?: string;
  name?: string;
  displayName?: string | null;
  email: string;
  avatarUrl?: string | null;
  avatar?: string;
}): User {
  return {
    id: userData.sub || userData.id || '',
    name: userData.name || userData.displayName || userData.email.split('@')[0],
    email: userData.email,
    avatar: userData.avatarUrl || userData.avatar,
  };
}

async function fetchCurrentUser(): Promise<User> {
  const response = await api.get<{ user: Parameters<typeof mapApiUser>[0] }>('/users/me');
  return mapApiUser(response.data.user);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [isLoading, setIsLoading] = useState(true);

  const clearAuth = useCallback(() => {
    clearAccessToken();
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      setIsLoading(true);
      try {
        let accessToken = getAccessToken();
        let loadedUser: User | null = null;

        if (accessToken) {
          try {
            loadedUser = await fetchCurrentUser();
          } catch {
            accessToken = null;
          }
        }

        if (!loadedUser) {
          const refreshed = await refreshAccessToken();
          accessToken = refreshed.accessToken;
          setAccessToken(accessToken);
          loadedUser = await fetchCurrentUser();
        }

        if (cancelled) return;
        setToken(accessToken);
        setUser(loadedUser);
        if (loadedUser?.id) {
          void ensureE2eeReady(loadedUser.id).catch(() => {
            /* keys upload retried on next session */
          });
        }
      } catch {
        if (!cancelled) {
          clearAuth();
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [clearAuth]);

  const login = useCallback((userData: unknown, newToken: string) => {
    setAccessToken(newToken);
    setToken(newToken);
    const mapped = mapApiUser(userData as Parameters<typeof mapApiUser>[0]);
    setUser(mapped);
    if (mapped.id) {
      void ensureE2eeReady(mapped.id).catch(() => {
        /* retried on next login */
      });
    }
  }, []);

  const applyProfile = useCallback(
    (profile: { id: string; email: string; displayName?: string | null; avatarUrl?: string | null }) => {
      setUser((prev) => {
        if (prev && prev.id !== profile.id) return prev;
        const email = profile.email || prev?.email || '';
        const displayName =
          profile.displayName !== undefined && profile.displayName !== null
            ? profile.displayName
            : prev?.name;
        return {
          id: profile.id,
          email,
          name: displayName || email.split('@')[0],
          avatar:
            profile.avatarUrl !== undefined
              ? profile.avatarUrl ?? undefined
              : prev?.avatar,
        };
      });
    },
    [],
  );

  const refreshProfile = useCallback(async () => {
    const res = await api.get<{
      user: { id: string; email: string; displayName: string | null; avatarUrl: string | null };
    }>('/users/me');
    applyProfile(res.data.user);
  }, [applyProfile]);

  const logout = useCallback(async () => {
    try {
      await unregisterWebPush();
    } catch {
      /* best-effort */
    }
    try {
      await api.post('/auth/logout');
    } catch {
      // Clear local session even if server logout fails (e.g. expired token).
    }
    clearAuth();
  }, [clearAuth]);

  const logoutAll = useCallback(async () => {
    try {
      await unregisterWebPush();
    } catch {
      /* best-effort */
    }
    try {
      await api.post('/auth/logout-all');
    } catch {
      // Still clear local state.
    }
    clearAuth();
  }, [clearAuth]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        applyProfile,
        refreshProfile,
        logout,
        logoutAll,
        isAuthenticated: !!token && !!user,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
