import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createGroup, patchGroup } from '../api/groupsApi';
import type { GroupVisibility } from '../types';
import type { DiscoverableUser } from '../hooks/useChatData';
import type { UploadFileResponse } from '../hooks/useUpload';
import { avatarFileNameFromUpload } from '../../settings/utils/avatarUrl';

type UploadFn = (file: File) => Promise<UploadFileResponse>;

export async function submitCreateGroup(params: {
  title: string;
  selected: DiscoverableUser[];
  visibility: GroupVisibility;
  avatarFile: File | null;
  uploadFile: UploadFn;
  queryClient: QueryClient;
}): Promise<string | null> {
  const name = params.title.trim();
  if (!name) {
    toast.error('Enter a group name');
    return null;
  }
  if (params.selected.length < 1) {
    toast.error('Select at least one member');
    return null;
  }

  const result = await createGroup({
    title: name,
    memberIds: params.selected.map((u) => u.id),
    groupVisibility: params.visibility,
  });

  if (params.avatarFile) {
    const uploaded = await params.uploadFile(params.avatarFile);
    if (uploaded.ok) {
      const fileName = avatarFileNameFromUpload(uploaded.data);
      if (fileName) {
        await patchGroup(result.chat.id, { avatarUrl: fileName });
      } else {
        toast.error('Group created, but the photo file name was missing');
      }
    } else {
      toast.error(uploaded.message || 'Group created, but the photo could not be uploaded');
    }
  }

  await params.queryClient.invalidateQueries({ queryKey: ['conversations'] });
  await params.queryClient.invalidateQueries({ queryKey: ['group', result.chat.id] });
  return result.chat.id;
}
