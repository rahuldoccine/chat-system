import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, MessageSquare, Phone, Search, Video } from 'lucide-react';
import MessageStream from '../features/chat/components/MessageStream';
import MessageComposer from '../features/chat/components/MessageComposer';
import ChatSubNav from '../features/chat/components/ChatSubNav';
import ChatFilesPanel from '../features/chat/components/ChatFilesPanel';
import ChatPinsPanel from '../features/chat/components/ChatPinsPanel';
import ChatCallHistoryPanel from '../features/chat/components/ChatCallHistoryPanel';
import ChatInMessageSearch from '../features/chat/components/ChatInMessageSearch';
import ChatDetailsPanel from '../features/chat/components/ChatDetailsPanel';
import DmHeaderMenu from '../features/chat/components/DmHeaderMenu';
import MessagingRestrictedNotice from '../features/chat/components/MessagingRestrictedNotice';
import UserAvatar from '../features/chat/components/UserAvatar';
import ChatAvatar from '../features/chat/components/ChatAvatar';
import type { Chat } from '../features/chat/types';
import type { BlockStatus } from '../features/chat/hooks/useBlockStatus';
import {
  getChatHeaderStatusClassName,
  getChatHeaderStatusText,
  getSectionBackLabel,
} from './homePage.helpers';
import styles from './HomePage.module.css';

type ActiveChatViewProps = {
  activeId: string;
  activeChat: Chat | undefined;
  chatName: string;
  isMobile: boolean;
  blockStatus: BlockStatus | undefined;
  typingCount: number;
  isPeerTyping: boolean;
  peerTypingIds: string[];
  isPeerOnline: boolean;
  groupDetailsMemberCount: number | undefined;
  callDisabledReason: string | undefined;
  canCall: boolean;
  canJoinPublicGroup: boolean;
  canJoinExistingGroupCall: boolean;
  joiningGroup: boolean;
  isMessagingRestricted: boolean;
  activeSection: string;
  groupCallState: {
    sessionId: string | null;
    kind: string;
  };
  activeGroupSessionInThisChat: boolean;
  alreadyJoinedGroupSession: boolean;
  ongoingGroupCallParticipantCount: number;
  onBack: () => void;
  onOpenSearch: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onJoinPublicGroup: () => void;
  onJoinGroupCall: (video: boolean) => void;
  onSectionBack: () => void;
  onGroupLeave: () => void;
};

function renderChatHeaderAvatar(activeChat: Chat | undefined, chatName: string) {
  if (activeChat?.type === 'DIRECT' && activeChat.dmPeer) {
    return (
      <UserAvatar
        userId={activeChat.dmPeer.id}
        avatarUrl={activeChat.dmPeer.avatarUrl}
        displayName={activeChat.dmPeer.displayName}
        email={activeChat.dmPeer.email}
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          flexShrink: 0,
        }}
        fallbackFontSize="1rem"
      />
    );
  }
  if (activeChat?.type === 'GROUP') {
    return (
      <ChatAvatar chat={activeChat} chatName={chatName} size={40} borderRadius={12} />
    );
  }
  return null;
}

function renderMessagesFooter(
  canJoinPublicGroup: boolean,
  isMessagingRestricted: boolean,
  blockStatus: BlockStatus | undefined,
  chatName: string,
) {
  if (isMessagingRestricted && blockStatus) {
    return <MessagingRestrictedNotice peerName={chatName} blockStatus={blockStatus} />;
  }
  if (canJoinPublicGroup) return null;
  return <MessageComposer />;
}

const ActiveChatView: React.FC<ActiveChatViewProps> = ({
  activeId,
  activeChat,
  chatName,
  isMobile,
  blockStatus,
  typingCount,
  isPeerTyping,
  peerTypingIds,
  isPeerOnline,
  groupDetailsMemberCount,
  callDisabledReason,
  canCall,
  canJoinPublicGroup,
  canJoinExistingGroupCall,
  joiningGroup,
  isMessagingRestricted,
  activeSection,
  groupCallState,
  activeGroupSessionInThisChat,
  alreadyJoinedGroupSession,
  ongoingGroupCallParticipantCount,
  onBack,
  onOpenSearch,
  onVoiceCall,
  onVideoCall,
  onJoinPublicGroup,
  onJoinGroupCall,
  onSectionBack,
  onGroupLeave,
}) => {
  const statusInput = {
    blockStatus,
    typingCount,
    isPeerOnline,
    activeChat,
    memberCount: groupDetailsMemberCount,
  };

  return (
    <motion.div
      key={`chat-${activeId}`}
      initial={isMobile ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={isMobile ? undefined : { opacity: 0 }}
      transition={isMobile ? { duration: 0 } : { duration: 0.2 }}
      className={styles.chatMotionWrap}
    >
      <header className={styles.chatHeader}>
        <div className={styles.chatHeaderLeft}>
          <button
            type="button"
            onClick={onBack}
            className={`${styles.chatHeaderBackBtn} back-btn-mobile`}
            aria-label="Back to home"
          >
            <ArrowLeft size={20} />
          </button>
          {renderChatHeaderAvatar(activeChat, chatName)}
          <div className={styles.chatHeaderTitleBlock}>
            <h4>{chatName}</h4>
            <span
              className={`${styles.chatHeaderStatus} ${getChatHeaderStatusClassName(statusInput, {
                statusBlocked: styles.statusBlocked,
                statusOnline: styles.statusOnline,
                statusMuted: styles.statusMuted,
              })}`}
            >
              {getChatHeaderStatusText(statusInput)}
            </span>
          </div>
        </div>

        <div className={styles.chatHeaderActions}>
          <button
            type="button"
            title="Search in chat (Ctrl+F)"
            aria-label="Search in chat"
            onClick={onOpenSearch}
            className={styles.headerIconBtn}
          >
            <Search size={20} />
          </button>
          <button
            type="button"
            title={callDisabledReason}
            aria-label="Voice call"
            disabled={!canCall}
            onClick={onVoiceCall}
            className={`${styles.headerIconBtn} ${styles.headerCallBtn}`}
          >
            <Phone size={20} />
          </button>
          <button
            type="button"
            title={callDisabledReason}
            aria-label="Video call"
            disabled={!canCall}
            onClick={onVideoCall}
            className={`${styles.headerIconBtn} ${styles.headerCallBtn}`}
          >
            <Video size={20} />
          </button>
          {activeChat?.type === 'DIRECT' && activeChat.dmPeer && (
            <DmHeaderMenu
              peerId={activeChat.dmPeer.id}
              peerName={chatName}
              chatId={activeChat.id}
            />
          )}
        </div>
      </header>

      {canJoinPublicGroup && (
        <div className={styles.joinGroupBanner}>
          <span className={styles.joinGroupBannerText}>
            This is a public group. Join to read and send messages.
          </span>
          <button
            type="button"
            disabled={joiningGroup}
            onClick={onJoinPublicGroup}
            className={styles.joinGroupBtn}
          >
            {joiningGroup ? 'Joining…' : 'Join group'}
          </button>
        </div>
      )}

      {activeChat?.type === 'GROUP' && activeGroupSessionInThisChat && !alreadyJoinedGroupSession && (
        <div className={styles.groupCallBanner}>
          <div className={styles.groupCallBannerText}>
            <span className={styles.groupCallBannerTitle}>Ongoing group call</span>
            <span className={styles.groupCallBannerMeta}>
              {ongoingGroupCallParticipantCount} participant
              {ongoingGroupCallParticipantCount > 1 ? 's' : ''} in this call
            </span>
          </div>
          <div className={styles.groupCallBannerActions}>
            {groupCallState.kind === 'VIDEO' ? (
              <button
                type="button"
                disabled={!canJoinExistingGroupCall}
                onClick={() => onJoinGroupCall(true)}
                className={styles.groupCallJoinVideoBtn}
              >
                Join video
              </button>
            ) : (
              <button
                type="button"
                disabled={!canJoinExistingGroupCall}
                onClick={() => onJoinGroupCall(false)}
                className={styles.groupCallJoinBtn}
              >
                Join audio
              </button>
            )}
          </div>
        </div>
      )}

      <ChatSubNav
        showGroupDetailsTabs={activeChat?.type === 'GROUP'}
        restrictToMessages={canJoinPublicGroup}
      />

      {activeSection !== 'messages' && !canJoinPublicGroup && (
        <div className={styles.sectionBackBar}>
          <button
            type="button"
            className={styles.sectionBackBtn}
            onClick={onSectionBack}
            aria-label="Back to messages"
          >
            <ArrowLeft size={20} />
          </button>
          <span className={styles.sectionBackLabel}>{getSectionBackLabel(activeSection)}</span>
        </div>
      )}

      <ChatInMessageSearch chatId={activeId} />

      <div className={styles.chatMainColumn}>
        <div
          className={
            activeSection === 'messages' ? styles.messagesSection : styles.messagesSectionHidden
          }
        >
          {canJoinPublicGroup ? (
            <div className={styles.joinGroupEmpty}>
              <MessageSquare size={26} />
              <p>Join this public group to view messages.</p>
            </div>
          ) : (
            <MessageStream
              isPeerTyping={isPeerTyping}
              peerTypingCount={typingCount}
              peerTypingIds={peerTypingIds}
            />
          )}
          {renderMessagesFooter(canJoinPublicGroup, isMessagingRestricted, blockStatus, chatName)}
        </div>
        {activeSection === 'files' && <ChatFilesPanel />}
        {activeSection === 'pins' && <ChatPinsPanel />}
        {activeSection === 'calls' && <ChatCallHistoryPanel />}
        {(activeSection === 'members' || activeSection === 'settings') && activeChat && (
          <ChatDetailsPanel
            chat={activeChat}
            chatName={chatName}
            isPeerOnline={Boolean(isPeerOnline)}
            onGroupLeave={onGroupLeave}
          />
        )}
      </div>
    </motion.div>
  );
};

export default ActiveChatView;
