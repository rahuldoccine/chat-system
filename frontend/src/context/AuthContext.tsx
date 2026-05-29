import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../api/axios';
import {
  clearAccessToken,
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
} from '../api/authSession';
import { unregisterWebPush } from '../services/push';
import { ensureE2eeReady, E2eeKeysLockedError } from '../features/e2ee/bootstrap';
import {
  clearSessionUnlock,
  unlockKeyMaterialWithPassword,
} from '../features/e2ee/accountSync';
import {
  ensureDecryptedPayloadHydrated,
  clearDecryptedPayloadForUser,
} from '../features/e2ee/decryptedPayloadCache';
import {
  ensureSentPlaintextHydrated,
  clearSentPlaintextForUser,
} from '../features/e2ee/sentPlaintextCache';
import { emitE2eeKeysUnlocked } from '../features/e2ee/e2eeEvents';
import { hydrateGroupSenderKeysFromIdb } from '../features/e2ee/groupSenderKeys';

interface User {
  id: string;
  name?: string;
  email: string;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (user: unknown, token: string, password?: string) => Promise<void>;
  e2eeKeysLocked: boolean;
  markE2eeUnlocked: () => void;
  unlockE2eeWithPassword: (password: string) => Promise<void>;
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

async function hydrateE2eeCaches(userId: string): Promise<void> {
  await Promise.all([
    ensureSentPlaintextHydrated(userId),
    ensureDecryptedPayloadHydrated(userId),
    hydrateGroupSenderKeysFromIdb(),
  ]);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [isLoading, setIsLoading] = useState(true);
  const [e2eeKeysLocked, setE2eeKeysLocked] = useState(false);

  const clearAuth = useCallback(() => {
    clearSessionUnlock();
    clearAccessToken();
    setToken(null);
    setUser(null);
    setE2eeKeysLocked(false);
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
          try {
            await ensureE2eeReady(loadedUser.id);
            setE2eeKeysLocked(false);
            void hydrateE2eeCaches(loadedUser.id);
          } catch (err) {
            if (err instanceof E2eeKeysLockedError) {
              setE2eeKeysLocked(true);
            } else {
              console.warn('[e2ee] ensureE2eeReady on session start failed', err);
            }
          }
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

  const markE2eeUnlocked = useCallback(() => {
    setE2eeKeysLocked(false);
    if (user?.id) {
      void hydrateE2eeCaches(user.id);
      emitE2eeKeysUnlocked(user.id);
    }
  }, [user?.id]);

  const unlockE2eeWithPassword = useCallback(
    async (password: string) => {
      if (!user?.id) {
        throw new E2eeKeysLockedError();
      }
      await unlockKeyMaterialWithPassword(user.id, password);
      await ensureE2eeReady(user.id, { password });
      setE2eeKeysLocked(false);
      await hydrateE2eeCaches(user.id);
      emitE2eeKeysUnlocked(user.id);
    },
    [user?.id],
  );

  const login = useCallback(async (userData: unknown, newToken: string, password?: string) => {
    setAccessToken(newToken);
    setToken(newToken);
    const mapped = mapApiUser(userData as Parameters<typeof mapApiUser>[0]);
    setUser(mapped);
    setE2eeKeysLocked(false);
    if (mapped.id) {
      try {
        await ensureE2eeReady(mapped.id, { password });
        setE2eeKeysLocked(false);
        void hydrateE2eeCaches(mapped.id);
        emitE2eeKeysUnlocked(mapped.id);
      } catch (err) {
        if (err instanceof E2eeKeysLockedError) {
          setE2eeKeysLocked(true);
          throw err;
        }
        console.warn('[e2ee] ensureE2eeReady on login failed', err);
        throw err;
      }
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
    const uid = user?.id;
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
    if (uid) {
      await Promise.all([
        clearSentPlaintextForUser(uid),
        clearDecryptedPayloadForUser(uid),
      ]);
    }
    clearAuth();
  }, [clearAuth, user?.id]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        e2eeKeysLocked,
        markE2eeUnlocked,
        unlockE2eeWithPassword,
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
