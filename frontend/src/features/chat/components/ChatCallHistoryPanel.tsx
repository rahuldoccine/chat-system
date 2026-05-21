import React from 'react';
import panelStyles from './ChatPanel.module.css';
import CallHistoryPanel from '../../calls/components/CallHistoryPanel';
import { useChat } from '../../../context/ChatContext';
import { useConversations } from '../hooks/useChatData';
import type { Chat } from '../types';

const ChatCallHistoryPanel: React.FC = () => {
  const { activeId } = useChat();
  const { data: conversations } = useConversations();
  const chat = (conversations as { data?: Chat[] } | undefined)?.data?.find((c) => c.id === activeId);

  if (!chat) {
    return null;
  }

  if (chat.type !== 'DIRECT' || !chat.dmPeer) {
    return (
      <div className={panelStyles.panel}>
        <p className={panelStyles.empty}>Call history is available in direct messages.</p>
      </div>
    );
  }

  const peerName = chat.dmPeer.displayName ?? chat.dmPeer.email ?? 'Contact';

  return (
    <div className={panelStyles.panel}>
      <CallHistoryPanel
        chatId={chat.id}
        peerUserId={chat.dmPeer.id}
        peerDisplayName={peerName}
        peerAvatarUrl={chat.dmPeer.avatarUrl}
        peerEmail={chat.dmPeer.email}
      />
    </div>
  );
};

export default ChatCallHistoryPanel;
