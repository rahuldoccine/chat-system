import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { syncUserProfileInCaches } from '../utils/syncProfileCaches';
import { subscribeProfileBroadcast } from '../utils/profileBroadcast';

/**
 * Keeps AuthContext + React Query in sync when profile is saved in another tab
 * (e.g. Settings open in one tab, chat open in another).
 */
const ProfileSyncListener = () => {
  const queryClient = useQueryClient();
  const { user, applyProfile, refreshProfile } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    return subscribeProfileBroadcast((profile) => {
      syncUserProfileInCaches(queryClient, profile);
      const current = userRef.current;
      if (current?.id === profile.id) {
        applyProfile({
          id: profile.id,
          email: profile.email,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        });
      }
    });
  }, [queryClient, applyProfile]);

  // When switching back to a tab (e.g. chat after saving in Settings), reload profile from API.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshProfile();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshProfile]);

  return null;
};

export default ProfileSyncListener;
