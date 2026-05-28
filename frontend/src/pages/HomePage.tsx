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
import { MessageSquare, Phone, Video, Info, ArrowLeft, Search } from 'lucide-react';
import ChatInMessageSearch from '../features/chat/components/ChatInMessageSearch';
import ChatDetailsPanel from '../features/chat/components/ChatDetailsPanel';
import ThreadPanel from '../features/chat/components/ThreadPanel';
import ConnectionStatusBanner from '../features/chat/components/ConnectionStatusBanner';
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

const HomePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { refreshProfile, user } = useAuth();
  const {
    activeId,
    setActiveId,
    setActiveSection,
    isDetailsOpen,
    setDetailsOpen,
    activeSection,
    setGroupDetailsTab,
    activeThreadRootId,
    setInChatSearchOpen,
  } = useChat();
  const queryClient = useQueryClient();
  const { data: conversations } = useConversations();
  const activeChat = (conversations as { data?: Chat[] })?.data?.find((c) => c.id === activeId);
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
          <AnimatePresence mode="wait">
            {!activeId ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                style={{ 
                  flex: 1, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  background: '#f8fafc',
                  padding: '2rem',
                  textAlign: 'center'
                }}
              >
                <div style={{ 
                  width: 80, 
                  height: 80, 
                  background: 'white', 
                  borderRadius: 24, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  boxShadow: 'var(--shadow-lg)',
                  marginBottom: '1.5rem',
                  color: 'var(--primary)'
                }}>
                  <MessageSquare size={40} />
                </div>
                <h2 style={{ fontWeight: 800, marginBottom: '0.5rem' }}>Your Messages</h2>
                <p style={{ color: 'var(--muted-foreground)', maxWidth: 300 }}>
                  Select a conversation from the list to start chatting with your team.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}
              >
                <header style={{ 
                  height: '72px', 
                  padding: '0 2rem', 
                  backgroundColor: 'white', 
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  zIndex: 10
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button 
                      onClick={() => setActiveId(null)}
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        padding: '6px', 
                        cursor: 'pointer',
                        color: 'var(--muted-foreground)',
                        display: 'none',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      className="back-btn-mobile"
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
                    <div>
                      <h4 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--foreground)' }}>{chatName}</h4>
                      {(activeChat?.type === 'DIRECT' && activeChat.e2eeMode === 'DM_V1') ||
                      (activeChat?.type === 'GROUP' && activeChat.e2eeMode === 'GROUP_V1') ? (
                        <span
                          style={{
                            display: 'block',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: 'var(--muted-foreground)',
                          }}
                        >
                          Messages are end-to-end encrypted
                        </span>
                      ) : null}
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: blockStatus?.blockedByPeer
                            ? '#dc2626'
                            : blockStatus?.blockedByMe
                              ? 'var(--muted-foreground)'
                              : typingCount > 0 || isPeerOnline
                                ? 'var(--success)'
                                : 'var(--muted-foreground)',
                        }}
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
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', color: 'var(--muted-foreground)' }}>
                    <button
                      type="button"
                      title="Search in chat (Ctrl+F)"
                      aria-label="Search in chat"
                      onClick={() => setInChatSearchOpen(true)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        color: 'inherit',
                        cursor: 'pointer',
                        display: 'inline-flex',
                      }}
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
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        color: 'inherit',
                        cursor: canCall ? 'pointer' : 'not-allowed',
                        opacity: canCall ? 1 : 0.4,
                        display: 'inline-flex',
                      }}
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
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        color: 'inherit',
                        cursor: canCall ? 'pointer' : 'not-allowed',
                        opacity: canCall ? 1 : 0.4,
                        display: 'inline-flex',
                      }}
                    >
                      <Video size={20} />
                    </button>
                    <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
                    <Info 
                      size={20} 
                      cursor="pointer" 
                      style={{ color: isDetailsOpen ? 'var(--primary)' : 'currentColor' }}
                      onClick={() => setDetailsOpen(!isDetailsOpen)} 
                    />
                    {activeChat?.type === 'DIRECT' && activeChat.dmPeer && (
                      <DmHeaderMenu
                        peerId={activeChat.dmPeer.id}
                        peerName={chatName}
                        chatId={activeChat.id}
                      />
                    )}
                  </div>
                </header>

                <ConnectionStatusBanner />

                {canJoinPublicGroup && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      padding: '0.65rem 1rem',
                      borderBottom: '1px solid var(--border)',
                      background: 'rgba(88, 101, 242, 0.12)',
                    }}
                  >
                    <span style={{ fontSize: '0.85rem' }}>
                      This is a public group. Join to read and send messages.
                    </span>
                    <button
                      type="button"
                      disabled={joiningGroup}
                      onClick={() => void handleJoinPublicGroup()}
                      style={{
                        padding: '0.4rem 0.85rem',
                        borderRadius: 6,
                        border: 'none',
                        background: 'var(--primary, #5865f2)',
                        color: '#fff',
                        fontWeight: 600,
                        cursor: joiningGroup ? 'wait' : 'pointer',
                      }}
                    >
                      {joiningGroup ? 'Joining…' : 'Join group'}
                    </button>
                  </div>
                )}

                {activeChat?.type === 'GROUP' && activeGroupSessionInThisChat && !alreadyJoinedGroupSession && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      padding: '0.72rem 1rem',
                      borderBottom: '1px solid #dbe4ff',
                      background: '#f3f6ff',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e3a8a' }}>
                        Ongoing group call
                      </span>
                      <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>
                        {ongoingGroupCallParticipantCount} participant
                        {ongoingGroupCallParticipantCount > 1 ? 's' : ''} in this call
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      {groupCallState.kind === 'VIDEO' ? (
                        <button
                          type="button"
                          disabled={!canJoinExistingGroupCall}
                          onClick={() => {
                            if (!groupCallState.sessionId || !activeId || !canJoinExistingGroupCall) return;
                            void joinGroupCall(groupCallState.sessionId, activeId, true);
                          }}
                          style={{
                            minHeight: '32px',
                            padding: '0.35rem 0.7rem',
                            borderRadius: 999,
                            border: 'none',
                            background: '#2563eb',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            cursor: canJoinExistingGroupCall ? 'pointer' : 'not-allowed',
                            opacity: canJoinExistingGroupCall ? 1 : 0.55,
                          }}
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
                          style={{
                            minHeight: '32px',
                            padding: '0.35rem 0.7rem',
                            borderRadius: 999,
                            border: '1px solid #bfdbfe',
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            cursor: canJoinExistingGroupCall ? 'pointer' : 'not-allowed',
                            opacity: canJoinExistingGroupCall ? 1 : 0.55,
                          }}
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

                {activeId && (
                  <ChatInMessageSearch
                    chatId={activeId}
                    e2eeSearch={
                      activeChat?.type === 'DIRECT' && activeChat.e2eeMode === 'DM_V1'
                    }
                  />
                )}

                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      display: activeSection === 'messages' ? 'flex' : 'none',
                      flexDirection: 'column',
                      overflow: 'hidden',
                    }}
                  >
                    {canJoinPublicGroup ? (
                      <div
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexDirection: 'column',
                          gap: '0.45rem',
                          color: 'var(--muted-foreground)',
                          background: '#f8fafc',
                          padding: '1.5rem',
                          textAlign: 'center',
                        }}
                      >
                        <MessageSquare size={26} />
                        <p style={{ margin: 0, fontWeight: 600 }}>Join this public group to view messages.</p>
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
            )}
          </AnimatePresence>
        </div>

        {activeId && activeThreadRootId && (activeChat?.type === 'DIRECT' || activeChat?.type === 'GROUP') && (
          <ThreadPanel />
        )}

        <AnimatePresence>
          {activeId && isDetailsOpen && !activeThreadRootId && (
            <motion.div
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              style={{
                width: '300px',
                borderLeft: '1px solid var(--border)',
                background: 'var(--card)',
                padding: '2rem',
                display: 'flex',
                flexDirection: 'column',
                color: 'var(--foreground)',
              }}
            >
              {activeChat && (
                <ChatDetailsPanel
                  chat={activeChat}
                  chatName={chatName}
                  isPeerOnline={Boolean(isPeerOnline)}
                  onGroupLeave={() => setActiveId(null)}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MainLayout>
  );
};

export default HomePage;
