import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Check,
  Globe,
  Loader2,
  Lock,
  Rocket,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSocket } from '../../../context/SocketContext';
import { useSearchUsers, type DiscoverableUser } from '../hooks/useChatData';
import { invalidateUsersSearch } from '../utils/invalidateChatCaches';
import { useUpload } from '../hooks/useUpload';
import { createGroup, patchGroup } from '../api/groupsApi';
import type { GroupVisibility } from '../types';
import UserAvatar from './UserAvatar';
import { avatarFileNameFromUpload, validateAvatarFile } from '../../settings/utils/avatarUrl';
import styles from './CreateGroupModal.module.css';

const PAGE_SIZE = 5;

interface CreateGroupModalProps {
  onClose: () => void;
  onChatCreated: (chatId: string) => void;
}

const getUserLabel = (user: DiscoverableUser) =>
  user.displayName || user.username || user.email;

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ onClose, onChatCreated }) => {
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('PRIVATE');
  const [selected, setSelected] = useState<DiscoverableUser[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [submitting, setSubmitting] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { onlineUsers } = useSocket();
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

  const visibleUsers = useMemo(
    () => allUsers.slice(0, visibleCount),
    [allUsers, visibleCount],
  );

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
    const name = title.trim();
    if (!name) {
      toast.error('Enter a group name');
      return;
    }
    if (selected.length < 1) {
      toast.error('Select at least one member');
      return;
    }

    setSubmitting(true);
    try {
      const result = await createGroup({
        title: name,
        memberIds: selected.map((u) => u.id),
        e2eeMode: 'GROUP_V1',
        groupVisibility: visibility,
      });

      if (avatarFile) {
        const uploaded = await uploadFile(avatarFile);
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

      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      await queryClient.invalidateQueries({ queryKey: ['group', result.chat.id] });
      onChatCreated(result.chat.id);
      onClose();
    } catch {
      toast.error('Could not create group');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.panelWrap} aria-describedby={undefined}>
      <motion.div
        className={styles.panel}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
      >
        <header className={styles.header}>
          <Dialog.Title id="create-group-title" className={styles.headerTitle}>Create Group</Dialog.Title>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
          >
            <X size={18} />
          </button>
        </header>

        <div className={styles.body}>
          {/* Group info */}
          <section className={styles.section} aria-labelledby="section-group-info">
            <h4 className={styles.sectionTitle} id="section-group-info">
              <Users size={14} aria-hidden />
              Group info
            </h4>
            <div className={styles.avatarRow}>
              <button
                type="button"
                className={styles.avatarUpload}
                onClick={handleAvatarPick}
                disabled={busy}
                aria-label="Upload group image"
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="" className={styles.avatarPreview} />
                ) : (
                  <span className={styles.avatarPlaceholder}>
                    <Camera size={20} />
                    <span>Upload</span>
                  </span>
                )}
                <span className={styles.avatarOverlay} aria-hidden>
                  <Camera size={18} />
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className={styles.hiddenInput}
                onChange={handleAvatarChange}
              />
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="group-name">
                  Group name
                </label>
                <input
                  id="group-name"
                  type="text"
                  className={styles.textInput}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Project Alpha"
                  autoFocus
                  disabled={busy}
                />
              </div>
            </div>
          </section>

          <div className={styles.divider} />

          {/* Visibility */}
          <section className={styles.section} aria-labelledby="section-visibility">
            <h4 className={styles.sectionTitle} id="section-visibility">
              <Globe size={14} aria-hidden />
              Visibility
            </h4>
            <div className={styles.visibilityGrid} role="radiogroup" aria-label="Group visibility">
              <button
                type="button"
                role="radio"
                aria-checked={visibility === 'PUBLIC'}
                className={`${styles.visibilityCard} ${
                  visibility === 'PUBLIC' ? styles.visibilityCardSelected : ''
                }`}
                disabled={busy}
                onClick={() => setVisibility('PUBLIC')}
              >
                <span className={styles.visibilityCardIcon}>
                  <Globe size={16} />
                </span>
                <span className={styles.visibilityCardTitle}>Public</span>
                <span className={styles.visibilityCardDesc}>Anyone can join</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={visibility === 'PRIVATE'}
                className={`${styles.visibilityCard} ${
                  visibility === 'PRIVATE' ? styles.visibilityCardSelected : ''
                }`}
                disabled={busy}
                onClick={() => setVisibility('PRIVATE')}
              >
                <span className={styles.visibilityCardIcon}>
                  <Lock size={16} />
                </span>
                <span className={styles.visibilityCardTitle}>Private</span>
                <span className={styles.visibilityCardDesc}>Invite only (Owner / Mod)</span>
              </button>
            </div>
            <p className={styles.e2eeNote}>Groups are end-to-end encrypted by default.</p>
          </section>

          <div className={styles.divider} />

          {/* Members */}
          <section className={styles.section} aria-labelledby="section-members">
            <h4 className={styles.sectionTitle} id="section-members">
              <Users size={14} aria-hidden />
              Add members
            </h4>
            <div className={styles.searchRow}>
              <Search size={16} aria-hidden />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search users…"
                disabled={busy}
                aria-label="Search users"
              />
            </div>

            <p className={styles.selectedLabel}>
              Selected{selected.length > 0 ? ` (${selected.length})` : ''}
            </p>
            <div className={styles.chips}>
              <AnimatePresence mode="popLayout">
                {selected.length === 0 ? (
                  <motion.span
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{ fontSize: '0.75rem', color: '#6d7178' }}
                  >
                    Pick at least one person below
                  </motion.span>
                ) : (
                  selected.map((u) => (
                    <motion.button
                      key={u.id}
                      type="button"
                      className={styles.chip}
                      layout
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ duration: 0.15 }}
                      onClick={() => toggleMember(u)}
                      disabled={busy}
                    >
                      {getUserLabel(u)}
                      <span className={styles.chipRemove} aria-hidden>
                        <X size={12} />
                      </span>
                    </motion.button>
                  ))
                )}
              </AnimatePresence>
            </div>

            <div
              ref={listRef}
              className={styles.list}
              onScroll={handleListScroll}
              role="listbox"
              aria-label="Select members"
              aria-multiselectable
            >
              {showSpinner && allUsers.length === 0 ? (
                <div className={styles.loading}>
                  <Loader2 size={18} className={styles.spinner} />
                  <span>Loading people…</span>
                </div>
              ) : allUsers.length === 0 ? (
                <p className={styles.empty}>
                  {query.trim() ? 'No users match your search.' : 'Search to find people to add.'}
                </p>
              ) : (
                <>
                  {visibleUsers.map((user) => {
                    const checked = isSelected(user.id);
                    const online = onlineUsers.has(user.id);
                    return (
                      <button
                        key={user.id}
                        type="button"
                        role="option"
                        aria-selected={checked}
                        className={`${styles.memberRow} ${checked ? styles.memberRowSelected : ''}`}
                        disabled={busy}
                        onClick={() => toggleMember(user)}
                      >
                        <span
                          className={`${styles.checkBox} ${checked ? styles.checkBoxChecked : ''}`}
                          aria-hidden
                        >
                          {checked && <Check size={12} strokeWidth={3} />}
                        </span>
                        <UserAvatar
                          userId={user.id}
                          avatarUrl={user.avatarUrl}
                          displayName={user.displayName}
                          email={user.email}
                          fallbackFontSize="0.8rem"
                          style={{ width: 36, height: 36, flexShrink: 0 }}
                        />
                        <div className={styles.memberMeta}>
                          <span className={styles.memberName}>{getUserLabel(user)}</span>
                          <span className={styles.memberEmail}>{user.email}</span>
                        </div>
                        {online && <span className={styles.onlineBadge}>Online</span>}
                      </button>
                    );
                  })}
                  {hasMore && (
                    <p className={styles.loadMoreHint}>
                      Scroll for more ({allUsers.length - visibleCount} left)
                    </p>
                  )}
                </>
              )}
            </div>
          </section>
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.createBtn}
            disabled={busy || !canCreate}
            onClick={() => void handleCreate()}
          >
            {busy ? (
              <>
                <Loader2 size={18} className={styles.spinner} />
                {uploadingAvatar ? 'Uploading image…' : 'Creating…'}
              </>
            ) : (
              <>
                <Rocket size={18} aria-hidden />
                Create Group
              </>
            )}
          </button>
        </footer>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default CreateGroupModal;
