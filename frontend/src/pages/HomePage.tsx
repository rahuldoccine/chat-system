import React from 'react';
import { useSearchParams } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import MessageStream from '../features/chat/components/MessageStream';
import MessageComposer from '../features/chat/components/MessageComposer';
import { useChatTyping } from '../features/chat/hooks/useChatTyping';
import ChatSubNav from '../features/chat/components/ChatSubNav';
import ChatFilesPanel from '../features/chat/components/ChatFilesPanel';
import ChatPinsPanel from '../features/chat/components/ChatPinsPanel';
import ChatCallHistoryPanel from '../features/chat/components/ChatCallHistoryPanel';
import { useChat } from '../context/ChatContext';
import { useConversations } from '../features/chat/hooks/useChatData';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { formatLastSeen } from '../utils/timeFormat';
import { MessageSquare, Phone, Video, ArrowLeft, Search } from 'lucide-react';
import ChatInMessageSearch from '../features/chat/components/ChatInMessageSearch';
import ChatDetailsPanel from '../features/chat/components/ChatDetailsPanel';
import ThreadPanel from '../features/chat/components/ThreadPanel';
import DmHeaderMenu from '../features/chat/components/DmHeaderMenu';
import MessagingRestrictedNotice from '../features/chat/components/MessagingRestrictedNotice';
import { useBlockStatus } from '../features/chat/hooks/useBlockStatus';
import { useCall } from '../features/calls/CallProvider';
import { useGroupCall } from '../features/calls/GroupCallProvider';
import { useQuery } from '@tanstack/react-query';
import { fetchGroup, joinPublicGroup } from '../features/chat/api/groupsApi';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Chat } from '../features/chat/types';
import UserAvatar from '../features/chat/components/UserAvatar';
import ChatAvatar from '../features/chat/components/ChatAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import HomeDashboard from '../features/chat/components/HomeDashboard';
import { useE2eeChatPrefetch } from '../features/e2ee/useE2eeChatPrefetch';
import styles from './HomePage.module.css';
import { useIsMobile } from '../hooks/useBreakpoint';

const HomePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { refreshProfile, user } = useAuth();
  const {
    activeId,
    setActiveId,
    setActiveSection,
    activeSection,
    setGroupDetailsTab,
    activeThreadRootId,
    setInChatSearchOpen,
  } = useChat();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { data: conversations } = useConversations();
  const chatList = (conversations as { data?: Chat[] })?.data ?? [];
  const activeChat = chatList.find((c) => c.id === activeId);
  useE2eeChatPrefetch(activeId, activeChat);
  const [joiningGroup, setJoiningGroup] = React.useState(false);
  const canJoinPublicGroup = Boolean(
    activeChat?.type === 'GROUP' && activeChat.canJoin && activeChat.isMember === false,
  );
  const { onlineUsers, isConnected } = useSocket();
  const { phase, startCall, isStarting } = useCall();
  const { startGroupCall, joinGroupCall, state: groupCallState } = useGroupCall();
  const { data: groupDetails } = useQuery({
    queryKey: ['group', activeId],
    queryFn: () => fetchGroup(activeId!),
    enabled: Boolean(activeId && activeChat?.type === 'GROUP'),
  });
  const { peerTypingCount: typingCount } = useChatTyping(activeId, user?.id);

  React.useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const chatIdFromUrl = searchParams.get('chat');
  React.useEffect(() => {
    if (!chatIdFromUrl) return;
    if (activeId === chatIdFromUrl) return;
    setActiveId(chatIdFromUrl);
  }, [chatIdFromUrl, activeId, setActiveId]);

  const getChatName = (chat: any) => {
    if (!chat) return '';
    if (chat.type === 'GROUP') return chat.title || 'Untitled Group';
    return chat.dmPeer?.displayName || chat.dmPeer?.email || 'Unknown User';
  };

  const chatName = getChatName(activeChat);

  const dmPeerId =
    activeChat?.type === 'DIRECT' ? activeChat.dmPeer?.id : undefined;
  const { data: blockStatus } = useBlockStatus(dmPeerId);
  const isMessagingRestricted = Boolean(
    blockStatus && (blockStatus.blockedByMe || blockStatus.blockedByPeer),
  );

  const canDmCall =
    Boolean(activeId && dmPeerId) &&
    activeChat?.type === 'DIRECT' &&
    !isMessagingRestricted &&
    phase === 'idle' &&
    !isStarting &&
    isConnected;

  const activeGroupSessionInThisChat =
    Boolean(
      activeId &&
        activeChat?.type === 'GROUP' &&
        groupCallState.sessionId &&
        groupCallState.chatId === activeId,
    );
  const alreadyJoinedGroupSession = activeGroupSessionInThisChat && Boolean(groupCallState.localStream);
  const canJoinExistingGroupCall =
    activeGroupSessionInThisChat && !alreadyJoinedGroupSession && phase === 'idle' && !isStarting && isConnected;
  const ongoingGroupCallParticipantCount = Math.max(groupCallState.participants.length, 1);

  const canGroupCall =
    Boolean(activeId) &&
    activeChat?.type === 'GROUP' &&
    phase === 'idle' &&
    !isStarting &&
    isConnected &&
    (!groupCallState.sessionId || canJoinExistingGroupCall);

  const canCall = canDmCall || canGroupCall;

  const callDisabledReason = !activeId
    ? undefined
    : !isConnected
      ? 'Connecting…'
      : isMessagingRestricted
        ? "You can't call while someone is blocked"
        : isStarting
          ? 'Starting call…'
          : phase !== 'idle'
            ? 'Finish your current call first'
            : groupCallState.sessionId && !canJoinExistingGroupCall
              ? 'Already in a group call'
              : undefined;

  const isPeerOnline = activeChat?.type === 'DIRECT' && activeChat.dmPeer && (activeChat.dmPeer.isOnline || onlineUsers.has(activeChat.dmPeer.id));

  const handleJoinPublicGroup = async () => {
    if (!activeId || joiningGroup) return;
    setJoiningGroup(true);
    try {
      await joinPublicGroup(activeId);
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('You joined the group');
    } catch {
      toast.error('Could not join this group');
    } finally {
      setJoiningGroup(false);
    }
  };

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'f') return;
      if (!activeId) return;
      e.preventDefault();
      setInChatSearchOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeId, setInChatSearchOpen]);

  React.useEffect(() => {
    if (activeSection === 'members') setGroupDetailsTab('members');
    else if (activeSection === 'settings') setGroupDetailsTab('settings');
  }, [activeSection, setGroupDetailsTab]);

  React.useEffect(() => {
    if (canJoinPublicGroup && activeSection !== 'messages') {
      setActiveSection('messages');
    }
  }, [canJoinPublicGroup, activeSection, setActiveSection]);

  React.useEffect(() => {
    if (
      (activeSection === 'members' || activeSection === 'settings') &&
      activeChat?.type !== 'GROUP'
    ) {
      setActiveSection('messages');
    }
  }, [activeSection, activeChat?.type, setActiveSection]);

  return (
    <MainLayout>
      <div style={{ display: 'flex', flex: 1, minHeight: 0, maxHeight: '100%', overflow: 'hidden', width: '100%' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
          <AnimatePresence mode={isMobile ? 'sync' : 'wait'}>
            {!activeId && !isMobile ? (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className={styles.dashboardWrap}
              >
                <HomeDashboard
                  userName={user?.name ?? undefined}
                  conversations={chatList}
                  onlineUserIds={onlineUsers}
                  onSelectChat={setActiveId}
                />
              </motion.div>
            ) : activeId ? (
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
                      onClick={() => setActiveId(null)}
                      className={`${styles.chatHeaderBackBtn} back-btn-mobile`}
                      aria-label="Back to home"
                    >
                      <ArrowLeft size={20} />
                    </button>
                    {activeChat?.type === 'DIRECT' && activeChat.dmPeer ? (
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
                    ) : activeChat?.type === 'GROUP' ? (
                      <ChatAvatar
                        chat={activeChat}
                        chatName={chatName}
                        size={40}
                        borderRadius={12}
                      />
                    ) : null}
                    <div className={styles.chatHeaderTitleBlock}>
                      <h4>{chatName}</h4>
                      {(activeChat?.type === 'DIRECT' && activeChat.e2eeMode === 'DM_V1') ||
                      (activeChat?.type === 'GROUP' && activeChat.e2eeMode === 'GROUP_V1') ? (
                        <span className={styles.e2eeHint}>
                          Messages are end-to-end encrypted
                        </span>
                      ) : null}
                      <span
                        className={`${styles.chatHeaderStatus} ${
                          blockStatus?.blockedByPeer
                            ? styles.statusBlocked
                            : typingCount > 0 || isPeerOnline
                              ? styles.statusOnline
                              : styles.statusMuted
                        }`}
                      >
                        {blockStatus?.blockedByPeer
                          ? 'You have been blocked by this user'
                          : blockStatus?.blockedByMe
                            ? 'You blocked this user'
                            : typingCount > 0
                              ? activeChat?.type === 'GROUP'
                                ? `${typingCount} typing...`
                                : 'Typing...'
                              : activeChat?.type === 'GROUP'
                                ? `${groupDetails?.memberCount ?? '…'} members`
                                : isPeerOnline
                                  ? 'Online'
                                  : activeChat?.dmPeer?.lastSeenAt
                                    ? `Last seen ${formatLastSeen(activeChat.dmPeer.lastSeenAt)}`
                                    : 'Offline'}
                      </span>
                    </div>
                  </div>
                  
                  <div className={styles.chatHeaderActions}>
                    <button
                      type="button"
                      title="Search in chat (Ctrl+F)"
                      aria-label="Search in chat"
                      onClick={() => setInChatSearchOpen(true)}
                      className={styles.headerIconBtn}
                    >
                      <Search size={20} />
                    </button>
                    <button
                      type="button"
                      title={callDisabledReason}
                      aria-label="Voice call"
                      disabled={!canCall}
                      onClick={() => {
                        if (!canCall || !activeId) return;
                        if (activeChat?.type === 'GROUP') {
                          if (canJoinExistingGroupCall && groupCallState.sessionId) {
                            void joinGroupCall(groupCallState.sessionId, activeId, false);
                            return;
                          }
                          void startGroupCall(activeId, false);
                          return;
                        }
                        if (!dmPeerId) return;
                        void startCall({
                          chatId: activeId,
                          peerUserId: dmPeerId,
                          peerDisplayName: chatName,
                          video: false,
                        });
                      }}
                      className={`${styles.headerIconBtn} ${styles.headerCallBtn}`}
                    >
                      <Phone size={20} />
                    </button>
                    <button
                      type="button"
                      title={callDisabledReason}
                      aria-label="Video call"
                      disabled={!canCall}
                      onClick={() => {
                        if (!canCall || !activeId) return;
                        if (activeChat?.type === 'GROUP') {
                          if (canJoinExistingGroupCall && groupCallState.sessionId) {
                            void joinGroupCall(groupCallState.sessionId, activeId, true);
                            return;
                          }
                          void startGroupCall(activeId, true);
                          return;
                        }
                        if (!dmPeerId) return;
                        void startCall({
                          chatId: activeId,
                          peerUserId: dmPeerId,
                          peerDisplayName: chatName,
                          video: true,
                        });
                      }}
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
                      onClick={() => void handleJoinPublicGroup()}
                      className={styles.joinGroupBtn}
                    >
                      {joiningGroup ? 'Joining…' : 'Join group'}
                    </button>
                  </div>
                )}

                {activeChat?.type === 'GROUP' && activeGroupSessionInThisChat && !alreadyJoinedGroupSession && (
                  <div className={styles.groupCallBanner}>
                    <div className={styles.groupCallBannerText}>
                      <span className={styles.groupCallBannerTitle}>
                        Ongoing group call
                      </span>
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
                          onClick={() => {
                            if (!groupCallState.sessionId || !activeId || !canJoinExistingGroupCall) return;
                            void joinGroupCall(groupCallState.sessionId, activeId, true);
                          }}
                          className={styles.groupCallJoinVideoBtn}
                        >
                          Join video
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!canJoinExistingGroupCall}
                          onClick={() => {
                            if (!groupCallState.sessionId || !activeId || !canJoinExistingGroupCall) return;
                            void joinGroupCall(groupCallState.sessionId, activeId, false);
                          }}
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
                      onClick={() => setActiveSection('messages')}
                      aria-label="Back to messages"
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <span className={styles.sectionBackLabel}>
                      {activeSection === 'files'
                        ? 'Files & Media'
                        : activeSection === 'pins'
                          ? 'Pins'
                          : activeSection === 'calls'
                            ? 'Call History'
                            : activeSection === 'members'
                              ? 'Members'
                              : activeSection === 'settings'
                                ? 'Settings'
                                : 'Messages'}
                    </span>
                  </div>
                )}

                {activeId && (
                  <ChatInMessageSearch
                    chatId={activeId}
                    e2eeSearch={
                      activeChat?.type === 'DIRECT' && activeChat.e2eeMode === 'DM_V1'
                    }
                  />
                )}

                <div className={styles.chatMainColumn}>
                  <div
                    className={
                      activeSection === 'messages'
                        ? styles.messagesSection
                        : styles.messagesSectionHidden
                    }
                  >
                    {canJoinPublicGroup ? (
                      <div className={styles.joinGroupEmpty}>
                        <MessageSquare size={26} />
                        <p>Join this public group to view messages.</p>
                      </div>
                    ) : (
                      <MessageStream />
                    )}
                    {isMessagingRestricted && blockStatus ? (
                      <MessagingRestrictedNotice
                        peerName={chatName}
                        blockStatus={blockStatus}
                      />
                    ) : canJoinPublicGroup ? null : (
                      <MessageComposer />
                    )}
                  </div>
                  {activeSection === 'files' && <ChatFilesPanel />}
                  {activeSection === 'pins' && <ChatPinsPanel />}
                  {activeSection === 'calls' && <ChatCallHistoryPanel />}
                  {(activeSection === 'members' || activeSection === 'settings') && activeChat && (
                    <ChatDetailsPanel
                      chat={activeChat}
                      chatName={chatName}
                      isPeerOnline={Boolean(isPeerOnline)}
                      onGroupLeave={() => setActiveId(null)}
                    />
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {activeId && activeThreadRootId && (activeChat?.type === 'DIRECT' || activeChat?.type === 'GROUP') && (
          <ThreadPanel />
        )}

      </div>
    </MainLayout>
  );
};

export default HomePage;
