import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { Camera, Check, Globe, Loader2, Lock, Rocket, Search, Users, X } from 'lucide-react';
import { useSocket } from '../../../context/SocketContext';
import type { DiscoverableUser } from '../hooks/useChatData';
import UserAvatar from './UserAvatar';
import { handler } from '../../../utils/asyncHandler';
import a11yStyles from '../../../styles/a11y.module.css';
import styles from './CreateGroupModal.module.css';
import { useCreateGroupModalState } from './useCreateGroupModalState';

interface CreateGroupModalProps {
  onClose: () => void;
  onChatCreated: (chatId: string) => void;
}

const getUserLabel = (user: DiscoverableUser) =>
  user.displayName || user.username || user.email;

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ onClose, onChatCreated }) => {
  const { onlineUsers } = useSocket();
  const state = useCreateGroupModalState(onClose, onChatCreated);

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !state.busy && onClose()}>
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
              <Dialog.Title id="create-group-title" className={styles.headerTitle}>
                Create Group
              </Dialog.Title>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={onClose}
                aria-label="Close"
                disabled={state.busy}
              >
                <X size={18} />
              </button>
            </header>

            <CreateGroupModalBody onlineUsers={onlineUsers} getUserLabel={getUserLabel} state={state} />

            <footer className={styles.footer}>
              <button
                type="button"
                className={styles.createBtn}
                disabled={state.busy || !state.canCreate}
                onClick={handler(state.handleCreate)}
              >
                {state.busy ? (
                  <>
                    <Loader2 size={18} className={styles.spinner} />
                    {state.uploadingAvatar ? 'Uploading image…' : 'Creating…'}
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

type BodyProps = {
  onlineUsers: Set<string>;
  getUserLabel: (user: DiscoverableUser) => string;
  state: ReturnType<typeof useCreateGroupModalState>;
};

const CreateGroupModalBody: React.FC<BodyProps> = ({ onlineUsers, getUserLabel, state }) => (
  <div className={styles.body}>
    <section className={styles.section} aria-labelledby="section-group-info">
      <h4 className={styles.sectionTitle} id="section-group-info">
        <Users size={14} aria-hidden />
        Group info
      </h4>
      <div className={styles.avatarRow}>
        <button
          type="button"
          className={styles.avatarUpload}
          onClick={state.handleAvatarPick}
          disabled={state.busy}
          aria-label="Upload group image"
        >
          {state.avatarPreview ? (
            <img src={state.avatarPreview} alt="" className={styles.avatarPreview} />
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
          ref={state.fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className={styles.hiddenInput}
          onChange={state.handleAvatarChange}
        />
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="group-name">
            Group name
          </label>
          <input
            id="group-name"
            type="text"
            className={styles.textInput}
            value={state.title}
            onChange={(e) => state.setTitle(e.target.value)}
            placeholder="e.g. Project Alpha"
            autoFocus
            disabled={state.busy}
          />
        </div>
      </div>
    </section>

    <div className={styles.divider} />

    <section className={styles.section} aria-labelledby="section-visibility">
      <h4 className={styles.sectionTitle} id="section-visibility">
        <Globe size={14} aria-hidden />
        Visibility
      </h4>
      <fieldset className={styles.visibilityGrid}>
        <legend className={a11yStyles.srOnly}>Group visibility</legend>
        <label
          className={`${styles.visibilityCard} ${
            state.visibility === 'PUBLIC' ? styles.visibilityCardSelected : ''
          }`}
        >
          <input
            type="radio"
            name="create-group-visibility"
            value="PUBLIC"
            className={a11yStyles.srOnly}
            checked={state.visibility === 'PUBLIC'}
            disabled={state.busy}
            onChange={() => state.setVisibility('PUBLIC')}
          />
          <span className={styles.visibilityCardIcon}>
            <Globe size={16} />
          </span>
          <span className={styles.visibilityCardTitle}>Public</span>
          <span className={styles.visibilityCardDesc}>Anyone can join</span>
        </label>
        <label
          className={`${styles.visibilityCard} ${
            state.visibility === 'PRIVATE' ? styles.visibilityCardSelected : ''
          }`}
        >
          <input
            type="radio"
            name="create-group-visibility"
            value="PRIVATE"
            className={a11yStyles.srOnly}
            checked={state.visibility === 'PRIVATE'}
            disabled={state.busy}
            onChange={() => state.setVisibility('PRIVATE')}
          />
          <span className={styles.visibilityCardIcon}>
            <Lock size={16} />
          </span>
          <span className={styles.visibilityCardTitle}>Private</span>
          <span className={styles.visibilityCardDesc}>Invite only (Owner / Mod)</span>
        </label>
      </fieldset>
      <p className={styles.e2eeNote}>Groups are end-to-end encrypted by default.</p>
    </section>

    <div className={styles.divider} />

    <section className={styles.section} aria-labelledby="section-members">
      <h4 className={styles.sectionTitle} id="section-members">
        <Users size={14} aria-hidden />
        Add members
      </h4>
      <div className={styles.searchRow}>
        <Search size={16} aria-hidden />
        <input
          type="text"
          value={state.query}
          onChange={(e) => state.setQuery(e.target.value)}
          placeholder="Search users…"
          disabled={state.busy}
          aria-label="Search users"
        />
      </div>

      <p className={styles.selectedLabel}>
        Selected{state.selected.length > 0 ? ` (${state.selected.length})` : ''}
      </p>
      <CreateGroupSelectedChips state={state} getUserLabel={getUserLabel} />

      <ul
        ref={state.listRef}
        className={styles.list}
        onScroll={state.handleListScroll}
        aria-label="Select members"
      >
        <CreateGroupMemberList
          state={state}
          onlineUsers={onlineUsers}
          getUserLabel={getUserLabel}
        />
      </ul>
    </section>
  </div>
);

const CreateGroupSelectedChips: React.FC<{
  state: BodyProps['state'];
  getUserLabel: (user: DiscoverableUser) => string;
}> = ({ state, getUserLabel }) => (
  <div className={styles.chips}>
    {state.selected.length === 0 ? (
      <span style={{ fontSize: '0.75rem', color: '#6d7178' }}>Pick at least one person below</span>
    ) : (
      state.selected.map((u) => (
        <button
          key={u.id}
          type="button"
          className={styles.chip}
          onClick={() => state.toggleMember(u)}
          disabled={state.busy}
        >
          {getUserLabel(u)}
          <span className={styles.chipRemove} aria-hidden>
            <X size={12} />
          </span>
        </button>
      ))
    )}
  </div>
);

const CreateGroupMemberList: React.FC<BodyProps> = ({ state, onlineUsers, getUserLabel }) => {
  if (state.showSpinner && state.allUsers.length === 0) {
    return (
      <div className={styles.loading}>
        <Loader2 size={18} className={styles.spinner} />
        <span>Loading people…</span>
      </div>
    );
  }
  if (state.allUsers.length === 0) {
    return (
      <p className={styles.empty}>
        {state.query.trim() ? 'No users match your search.' : 'Search to find people to add.'}
      </p>
    );
  }
  return (
    <>
      {state.visibleUsers.map((user) => {
        const checked = state.isSelected(user.id);
        const online = onlineUsers.has(user.id);
        return (
          <li key={user.id}>
            <label
              className={`${styles.memberRow} ${checked ? styles.memberRowSelected : ''}`}
            >
              <input
                type="checkbox"
                className={a11yStyles.srOnly}
                checked={checked}
                disabled={state.busy}
                onChange={() => state.toggleMember(user)}
              />
              <span
                className={`${styles.checkBox} ${checked ? styles.checkBoxChecked : ''}`}
                aria-hidden
              >
                {checked ? <Check size={12} strokeWidth={3} /> : null}
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
              {online ? <span className={styles.onlineBadge}>Online</span> : null}
            </label>
          </li>
        );
      })}
      {state.hasMore ? (
        <p className={styles.loadMoreHint}>
          Scroll for more ({state.allUsers.length - state.visibleUsers.length} left)
        </p>
      ) : null}
    </>
  );
};

export default CreateGroupModal;
