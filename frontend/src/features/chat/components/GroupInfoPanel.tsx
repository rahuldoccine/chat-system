import React, { useEffect, useState } from 'react';
import { handler, handlerArg, handlerEvent } from '../../../utils/asyncHandler';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, LogOut, Trash2, UserPlus } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useChat } from '../../../context/ChatContext';
import type { Chat, GroupVisibility } from '../types';
import {
  addGroupMember,
  fetchGroup,
  leaveGroup,
  patchGroup,
  patchGroupMemberRole,
  removeGroupMember,
  type GroupMember,
  type GroupMemberRole,
} from '../api/groupsApi';
import { useSearchUsers, type DiscoverableUser } from '../hooks/useChatData';
import GroupVisibilitySection from './GroupVisibilitySection';
import {
  canManageGroupMeta,
  canModerateMessages,
  roleLabel,
} from '../utils/groupRoles';
import { isChatMuted, muteUntilIndefinite } from '../utils/mute';
import { useMuteChat, getApiErrorMessage } from '../../settings/hooks/useUserSettings';
import UserAvatar from './UserAvatar';
import ChatAvatar from './ChatAvatar';
import ConfirmModal from './ConfirmModal';
import a11yStyles from '../../../styles/a11y.module.css';
import styles from './GroupInfoPanel.module.css';

type GroupInfoPanelProps = {
  chat: Chat;
  chatName: string;
  onLeave?: () => void;
};

const getUserLabel = (m: GroupMember) => m.displayName || m.username || m.email;

const GroupInfoPanel: React.FC<GroupInfoPanelProps> = ({ chat, chatName, onLeave }) => {
  const { user } = useAuth();
  const { groupDetailsTab } = useChat();
  const queryClient = useQueryClient();
  const [editTitle, setEditTitle] = useState(chat.title ?? '');
  const [addQuery, setAddQuery] = useState('');
  const [muted, setMuted] = useState(() => isChatMuted(chat.mutedUntil));
  const [visibility, setVisibility] = useState<GroupVisibility>(
    chat.groupVisibility ?? 'PRIVATE',
  );
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leavePending, setLeavePending] = useState(false);
  const { mutateAsync: muteChat, isPending: muting } = useMuteChat();
  const { data: searchData } = useSearchUsers(addQuery);

  const { data: group, isLoading, refetch } = useQuery({
    queryKey: ['group', chat.id],
    queryFn: () => fetchGroup(chat.id),
    enabled: chat.type === 'GROUP',
  });

  useEffect(() => {
    setEditTitle(chat.title ?? '');
    setMuted(isChatMuted(chat.mutedUntil));
    setVisibility(group?.groupVisibility ?? chat.groupVisibility ?? 'PRIVATE');
  }, [chat.id, chat.title, chat.mutedUntil, chat.groupVisibility, group?.groupVisibility]);

  const myRole = group?.myRole ?? 'MEMBER';
  const canManage = canManageGroupMeta(myRole);
  const canEditInfoAndVisibility = myRole === 'OWNER' || myRole === 'ADMIN';
  const canInvite = myRole === 'OWNER' || myRole === 'ADMIN';
  const canMod = canModerateMessages(myRole);
  const handleSaveTitle = async () => {
    const t = editTitle.trim();
    if (!t || t === chat.title) return;
    try {
      await patchGroup(chat.id, { title: t });
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      await refetch();
      toast.success('Group updated');
    } catch {
      toast.error('Could not update group');
    }
  };

  const handleAddMember = async (u: DiscoverableUser) => {
    try {
      await addGroupMember(chat.id, u.id);
      await refetch();
      setAddQuery('');
      toast.success('Member added');
    } catch {
      toast.error('Could not add member');
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await removeGroupMember(chat.id, userId);
      await refetch();
      toast.success('Member removed');
    } catch {
      toast.error('Could not remove member');
    }
  };

  const handleRole = async (userId: string, role: GroupMemberRole) => {
    if (role !== 'ADMIN' && role !== 'MOD' && role !== 'MEMBER') return;
    try {
      await patchGroupMemberRole(chat.id, userId, role);
      await refetch();
    } catch {
      toast.error('Could not change role');
    }
  };

  const handleLeave = async () => {
    if (!user) return;
    setLeavePending(true);
    try {
      await leaveGroup(chat.id, user.id);
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setLeaveConfirmOpen(false);
      onLeave?.();
      toast.success('You left the group');
    } catch {
      toast.error('Could not leave group');
    } finally {
      setLeavePending(false);
    }
  };

  const handleVisibilityChange = async (next: GroupVisibility) => {
    if (next === visibility) return;
    const prev = visibility;
    setVisibility(next);
    try {
      await patchGroup(chat.id, { groupVisibility: next });
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      await refetch();
      toast.success(next === 'PUBLIC' ? 'Group is now public' : 'Group is now private');
    } catch {
      setVisibility(prev);
      toast.error('Could not update visibility');
    }
  };

  const handleMuteToggle = async () => {
    const nextMuted = !muted;
    try {
      await muteChat({
        chatId: chat.id,
        mutedUntil: nextMuted ? muteUntilIndefinite() : null,
      });
      setMuted(nextMuted);
      toast.success(nextMuted ? 'Notifications muted' : 'Notifications unmuted');
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't update notification settings."));
    }
  };

  if (isLoading || !group) {
    return (
      <div className={styles.panel}>
        <Loader2 className={styles.spinner} size={24} />
      </div>
    );
  }

  const candidates = (searchData?.data ?? []).filter(
    (u) => !group.members.some((m) => m.userId === u.id),
  );

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <ChatAvatar
          chat={{
            ...chat,
            avatarUrl: group.avatarUrl ?? chat.avatarUrl,
            groupVisibility: group.groupVisibility ?? chat.groupVisibility,
          }}
          chatName={chatName}
          size={72}
          borderRadius="50%"
          className={styles.avatar}
          fallbackFontSize="2rem"
        />
        <h3 className={styles.name}>{chatName}</h3>
        <p className={styles.subtitle}>{group.memberCount} members</p>
      </div>

      {groupDetailsTab === 'members' && (
        <div className={styles.section}>
          {canInvite && (
            <div className={styles.addRow}>
              <UserPlus size={16} />
              <input
                type="text"
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
                placeholder="Add people..."
              />
            </div>
          )}
          {canInvite && addQuery.trim() && candidates.length > 0 && (
            <div className={styles.candidates}>
              {candidates.slice(0, 5).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={styles.candidateItem}
                  onClick={handler(() => handleAddMember(u))}
                >
                  <UserAvatar
                    userId={u.id}
                    avatarUrl={u.avatarUrl ?? undefined}
                    displayName={u.displayName ?? undefined}
                    email={u.email}
                    className={styles.candidateAvatar}
                  />
                  <span className={styles.candidateMeta}>
                    <span className={styles.candidateName}>{u.displayName || u.email}</span>
                    {u.displayName ? <span className={styles.candidateEmail}>{u.email}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          )}
          <ul className={styles.memberList}>
            {group.members.map((m) => (
              <li key={m.userId} className={styles.memberRow}>
                <UserAvatar
                  userId={m.userId}
                  avatarUrl={m.avatarUrl ?? undefined}
                  displayName={m.displayName ?? undefined}
                  email={m.email}
                  className={styles.memberAvatar}
                />
                <div className={styles.memberMeta}>
                  <span className={styles.memberName}>{getUserLabel(m)}</span>
                  <span className={styles.roleBadge}>{roleLabel(m.role)}</span>
                </div>
                {m.userId !== user?.id && canManage && m.role !== 'OWNER' && (
                  <div className={styles.memberActions}>
                    {myRole === 'OWNER' && (
                      <select
                        value={m.role}
                        onChange={handlerEvent((e) =>
                          handleRole(m.userId, e.target.value as GroupMemberRole),
                        )}
                      >
                        <option value="MEMBER">Member</option>
                        <option value="MOD">Moderator</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    )}
                    {(canMod || myRole === 'ADMIN') && (
                      <button
                        type="button"
                        className={styles.removeBtn}
                        aria-label={`Remove ${getUserLabel(m)}`}
                        title={`Remove ${getUserLabel(m)}`}
                        onClick={handler(() => handleRemove(m.userId))}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {groupDetailsTab === 'settings' && (
        <div className={styles.section}>
          <div className={styles.settingsBlock}>
            <h4 className={styles.blockTitle}>Basic Info</h4>
            <div className={styles.field}>
              <label htmlFor="group-title">Group name</label>
              <input
                id="group-title"
                value={editTitle}
                disabled={!canEditInfoAndVisibility}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handler(handleSaveTitle)}
              />
              {canEditInfoAndVisibility ? null : (
                <div className={styles.readOnlyHint}>
                  Only Owner and Admin can edit basic group information.
                </div>
              )}
            </div>
          </div>

          <div className={styles.settingsBlock}>
            <h4 className={styles.blockTitle}>Visibility</h4>
            <GroupVisibilitySection
              value={visibility}
              onChange={handlerArg(handleVisibilityChange)}
              disabled={!canEditInfoAndVisibility}
            />
            {canEditInfoAndVisibility ? null : (
              <div className={styles.readOnlyHint}>
                Only Owner and Admin can change group visibility.
              </div>
            )}
          </div>

          <div className={styles.settingsBlock}>
            <h4 className={styles.blockTitle}>Notifications</h4>
            <div className={styles.muteRow}>
              <div>
                <div className={styles.muteLabel}>Mute notifications</div>
                <div className={styles.muteHint}>Turn off alerts for this group</div>
              </div>
              <label className={styles.toggle}>
                <span className={a11yStyles.srOnly}>Mute notifications</span>
                <input
                  type="checkbox"
                  checked={muted}
                  disabled={muting}
                  onChange={handler(handleMuteToggle)}
                  aria-label="Mute notifications"
                />
                <span className={styles.toggleSlider} />
              </label>
            </div>
          </div>

          <div className={styles.settingsBlock}>
            <h4 className={styles.blockTitleDanger}>Danger Zone</h4>
            <div className={styles.dangerHint}>
              Leaving this group removes it from your chat list until you are added again.
            </div>
            <button
              type="button"
              className={styles.leaveBtn}
              onClick={() => setLeaveConfirmOpen(true)}
            >
              <LogOut size={16} />
              Leave group
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={leaveConfirmOpen}
        title="Leave this group?"
        description="You will stop receiving messages from this group until someone adds you again."
        confirmLabel="Leave group"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={leavePending}
        onConfirm={handler(handleLeave)}
        onCancel={() => setLeaveConfirmOpen(false)}
      />
    </div>
  );
};

export default GroupInfoPanel;
