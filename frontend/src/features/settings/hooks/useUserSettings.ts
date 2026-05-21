import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api/axios';
import { useAuth } from '../../../context/AuthContext';
import { invalidateBlockStatus } from '../../chat/hooks/useBlockStatus';
import { syncUserProfileInCaches } from '../utils/syncProfileCaches';

export type Profile = {
  id: string;
  email: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
};

export type AppSettings = {
  notifyPush: boolean;
  notifyEmail: boolean;
  showReadReceipts: boolean;
};

export type PatchProfileInput = {
  displayName?: string;
  username?: string | null;
  avatarUrl?: string | null;
};

export const useProfile = (enabled = true) => {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await api.get<{ user: Profile }>('/users/me');
      return res.data.user;
    },
    enabled,
  });
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  const { applyProfile } = useAuth();
  return useMutation({
    mutationFn: async (body: PatchProfileInput) => {
      const res = await api.patch<{ user: Profile }>('/users/me', body);
      return res.data.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(['profile'], user);
      syncUserProfileInCaches(queryClient, user);
      applyProfile({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      });
    },
  });
};

export const useAppSettings = (enabled = true) => {
  return useQuery({
    queryKey: ['appSettings'],
    queryFn: async () => {
      const res = await api.get<{ settings: AppSettings }>('/users/me/settings');
      return res.data.settings;
    },
    enabled,
  });
};

export const useUpdateAppSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<AppSettings>) => {
      const res = await api.patch<{ settings: AppSettings }>('/users/me/settings', body);
      return res.data.settings;
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(['appSettings'], settings);
    },
  });
};

export const useMuteChat = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ chatId, mutedUntil }: { chatId: string; mutedUntil: string | null }) => {
      await api.patch(`/chats/${chatId}/mute`, { mutedUntil });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
};

export const useBlockUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blockedUserId: string) => {
      await api.post('/moderation/blocks', { blockedUserId });
    },
    onSuccess: (_data, blockedUserId) => {
      invalidateBlockStatus(queryClient, blockedUserId);
    },
  });
};

export const useUnblockUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blockedUserId: string) => {
      await api.delete(`/moderation/blocks/${blockedUserId}`);
    },
    onSuccess: (_data, blockedUserId) => {
      invalidateBlockStatus(queryClient, blockedUserId);
    },
  });
};

export type ReportUserInput = {
  targetUserId: string;
  chatId: string;
  reason: string;
  details?: string;
};

export const useReportUser = () => {
  return useMutation({
    mutationFn: async (body: ReportUserInput) => {
      await api.post('/moderation/reports', body);
    },
  });
};

export { getApiErrorMessage } from '../../../utils/userFriendlyErrors';
