import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSearchUsers, type DiscoverableUser } from '../hooks/useChatData';
import { invalidateUsersSearch } from '../utils/invalidateChatCaches';
import { useUpload } from '../hooks/useUpload';
import { submitCreateGroup } from './createGroupSubmit';
import type { GroupVisibility } from '../types';
import { validateAvatarFile } from '../../settings/utils/avatarUrl';

const PAGE_SIZE = 5;

export function useCreateGroupModalState(onClose: () => void, onChatCreated: (chatId: string) => void) {
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('PRIVATE');
  const [selected, setSelected] = useState<DiscoverableUser[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [submitting, setSubmitting] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const listRef = useRef<HTMLUListElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { uploadFile, status: uploadStatus } = useUpload();
  const { data, isLoading, isFetching } = useSearchUsers(query);

  const allUsers = data?.data ?? [];
  const showSpinner = isLoading || isFetching;
  const uploadingAvatar = uploadStatus === 'uploading';
  const busy = submitting || uploadingAvatar;
  const canCreate = Boolean(title.trim()) && selected.length >= 1;

  useEffect(() => {
    void invalidateUsersSearch(queryClient);
  }, [queryClient]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query]);

  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const visibleUsers = useMemo(() => allUsers.slice(0, visibleCount), [allUsers, visibleCount]);
  const hasMore = visibleCount < allUsers.length;

  const loadMore = useCallback(() => {
    setVisibleCount((c) => Math.min(c + PAGE_SIZE, allUsers.length));
  }, [allUsers.length]);

  const handleListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || !hasMore) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 48;
    if (nearBottom) loadMore();
  }, [hasMore, loadMore]);

  const isSelected = (userId: string) => selected.some((u) => u.id === userId);

  const toggleMember = (user: DiscoverableUser) => {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user],
    );
  };

  const handleAvatarPick = () => {
    if (busy) return;
    fileInputRef.current?.click();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    const err = validateAvatarFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const chatId = await submitCreateGroup({
        title,
        selected,
        visibility,
        avatarFile,
        uploadFile,
        queryClient,
      });
      if (!chatId) return;
      onChatCreated(chatId);
      onClose();
    } catch {
      toast.error('Could not create group');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    query,
    setQuery,
    title,
    setTitle,
    visibility,
    setVisibility,
    selected,
    busy,
    uploadingAvatar,
    canCreate,
    listRef,
    fileInputRef,
    showSpinner,
    allUsers,
    visibleUsers,
    hasMore,
    avatarPreview,
    handleListScroll,
    isSelected,
    toggleMember,
    handleAvatarPick,
    handleAvatarChange,
    handleCreate,
  };
}
