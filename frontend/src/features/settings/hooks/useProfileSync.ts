import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { syncUserProfileInCaches, type ProfileBroadcast } from '../utils/syncProfileCaches';
import { broadcastProfileToOtherTabs } from '../utils/profileBroadcast';
import type { Profile } from './useUserSettings';

/** Push profile changes to AuthContext + all React Query caches immediately. */
export function useProfileSync() {
  const queryClient = useQueryClient();
  const { applyProfile } = useAuth();

  const syncProfileEverywhere = useCallback(
    (profile: Profile | ProfileBroadcast & { email: string }) => {
      applyProfile({
        id: profile.id,
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      });
      syncUserProfileInCaches(queryClient, profile);
      // Cross-tab sync (Settings tab → Chat tab); socket also fires after PATCH.
      broadcastProfileToOtherTabs(profile);
    },
    [applyProfile, queryClient],
  );

  return { syncProfileEverywhere };
}
