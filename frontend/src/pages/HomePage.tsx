import React from 'react';
import { handler } from '../utils/asyncHandler';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import MainLayout from '../layouts/MainLayout';
import { useChatTyping } from '../features/chat/hooks/useChatTyping';
import { useChat } from '../context/ChatContext';
import { useConversations } from '../features/chat/hooks/useChatData';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useBlockStatus } from '../features/chat/hooks/useBlockStatus';
import { useCall } from '../features/calls/CallProvider';
import { useGroupCall } from '../features/calls/GroupCallProvider';
import { fetchGroup, joinPublicGroup } from '../features/chat/api/groupsApi';
import type { Chat } from '../features/chat/types';
import HomeDashboard from '../features/chat/components/HomeDashboard';
import ThreadPanel from '../features/chat/components/ThreadPanel';
import ActiveChatView from './ActiveChatView';
import { getCallDisabledReason, getChatName } from './homePage.helpers';
import styles from './HomePage.module.css';
import { useIsMobile } from '../hooks/useBreakpoint';

function renderHomeContent(
  activeId: string | null,
  isMobile: boolean,
  userName: string | undefined,
  chatList: Chat[],
  onlineUsers: Set<string>,
  setActiveId: (id: string | null) => void,
) {
  if (!activeId && !isMobile) {
    return (
      <motion.div
        key="dashboard"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className={styles.dashboardWrap}
      >
        <HomeDashboard
          userName={userName}
          conversations={chatList}
          onlineUserIds={onlineUsers}
          onSelectChat={setActiveId}
        />
      </motion.div>
    );
  }
  return null;
}

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
  const chatList = conversations?.data ?? [];
  const activeChat = chatList.find((c) => c.id === activeId);
  const [joiningGroup, setJoiningGroup] = React.useState(false);
  const canJoinPublicGroup = Boolean(
    activeChat?.type === 'GROUP' && activeChat.canJoin && activeChat.isMember === false,
  );
  const { onlineUsers, isConnected } = useSocket();
  const { phase, startCall, isStarting } = useCall();
  const { startGroupCall, joinGroupCall, state: groupCallState } = useGroupCall();
  const { data: groupDetails } = useQuery({
    queryKey: ['group', activeId],
    queryFn: () => {
      if (!activeId) throw new Error('activeId required');
      return fetchGroup(activeId);
    },
    enabled: Boolean(activeId && activeChat?.type === 'GROUP'),
  });
  const typingState = useChatTyping(activeId, user?.id);

  React.useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const chatIdFromUrl = searchParams.get('chat');
  React.useEffect(() => {
    if (!chatIdFromUrl) return;
    if (activeId === chatIdFromUrl) return;
    setActiveId(chatIdFromUrl);
  }, [chatIdFromUrl, activeId, setActiveId]);

  const chatName = getChatName(activeChat);

  const dmPeerId = activeChat?.type === 'DIRECT' ? activeChat.dmPeer?.id : undefined;
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

  const activeGroupSessionInThisChat = Boolean(
    activeId &&
      activeChat?.type === 'GROUP' &&
      groupCallState.sessionId &&
      groupCallState.chatId === activeId,
  );
  const alreadyJoinedGroupSession =
    activeGroupSessionInThisChat && Boolean(groupCallState.localStream);
  const canJoinExistingGroupCall =
    activeGroupSessionInThisChat &&
    !alreadyJoinedGroupSession &&
    phase === 'idle' &&
    !isStarting &&
    isConnected;
  const ongoingGroupCallParticipantCount = Math.max(groupCallState.participants.length, 1);

  const canGroupCall =
    Boolean(activeId) &&
    activeChat?.type === 'GROUP' &&
    phase === 'idle' &&
    !isStarting &&
    isConnected &&
    (!groupCallState.sessionId || canJoinExistingGroupCall);

  const canCall = canDmCall || canGroupCall;

  const callDisabledReason = getCallDisabledReason({
    activeId,
    isConnected,
    isMessagingRestricted,
    isStarting,
    phase,
    groupCallSessionId: groupCallState.sessionId,
    canJoinExistingGroupCall,
  });

  const isPeerOnline = Boolean(
    activeChat?.type === 'DIRECT' &&
      activeChat.dmPeer &&
      (activeChat.dmPeer.isOnline || onlineUsers.has(activeChat.dmPeer.id)),
  );

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

  const handleVoiceCall = () => {
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
  };

  const handleVideoCall = () => {
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
  };

  const handleJoinGroupCall = (video: boolean) => {
    if (!groupCallState.sessionId || !activeId || !canJoinExistingGroupCall) return;
    void joinGroupCall(groupCallState.sessionId, activeId, video);
  };

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'f') return;
      if (!activeId) return;
      e.preventDefault();
      setInChatSearchOpen(true);
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
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
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          maxHeight: '100%',
          overflow: 'hidden',
          width: '100%',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <AnimatePresence mode={isMobile ? 'sync' : 'wait'}>
            {renderHomeContent(
              activeId,
              isMobile,
              user?.name ?? undefined,
              chatList,
              onlineUsers,
              setActiveId,
            )}
            {activeId ? (
              <ActiveChatView
                activeId={activeId}
                activeChat={activeChat}
                chatName={chatName}
                isMobile={isMobile}
                blockStatus={blockStatus}
                typingCount={typingState.peerTypingCount}
                isPeerTyping={typingState.isPeerTyping}
                peerTypingIds={typingState.peerTypingIds}
                isPeerOnline={isPeerOnline}
                groupDetailsMemberCount={groupDetails?.memberCount}
                callDisabledReason={callDisabledReason}
                canCall={canCall}
                canJoinPublicGroup={canJoinPublicGroup}
                canJoinExistingGroupCall={canJoinExistingGroupCall}
                joiningGroup={joiningGroup}
                isMessagingRestricted={isMessagingRestricted}
                activeSection={activeSection}
                groupCallState={groupCallState}
                activeGroupSessionInThisChat={activeGroupSessionInThisChat}
                alreadyJoinedGroupSession={alreadyJoinedGroupSession}
                ongoingGroupCallParticipantCount={ongoingGroupCallParticipantCount}
                onBack={() => setActiveId(null)}
                onOpenSearch={() => setInChatSearchOpen(true)}
                onVoiceCall={handleVoiceCall}
                onVideoCall={handleVideoCall}
                onJoinPublicGroup={handler(handleJoinPublicGroup)}
                onJoinGroupCall={handleJoinGroupCall}
                onSectionBack={() => setActiveSection('messages')}
                onGroupLeave={() => setActiveId(null)}
              />
            ) : null}
          </AnimatePresence>
        </div>

        {activeId &&
          activeThreadRootId &&
          (activeChat?.type === 'DIRECT' || activeChat?.type === 'GROUP') && <ThreadPanel />}
      </div>
    </MainLayout>
  );
};

export default HomePage;
