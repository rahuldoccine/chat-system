import { handler } from '../../../utils/asyncHandler';
import CallMessageBubble from '../../calls/components/CallMessageBubble';
import CallTranscriptBubble from '../../calls/components/CallTranscriptBubble';
import GroupActivityBubble from './GroupActivityBubble';
import type { Message } from '../types';
import type { MessageKindFlags } from '../utils/messageStream.helpers';

type ActiveChatPeer = {
  id: string;
  displayName?: string;
  email?: string;
};

export function MessageStreamGroupActivityRow({
  msg,
}: Readonly<{
  msg: Message;
}>) {
  return (
    <div key={msg.id} id={`msg-${msg.id}`}>
      <GroupActivityBubble ciphertext={msg.ciphertext} />
    </div>
  );
}

export function MessageStreamCallTranscriptRow({
  msg,
  transcriptMeta,
}: Readonly<{
  msg: Message;
  transcriptMeta: NonNullable<MessageKindFlags['transcriptMeta']>;
}>) {
  return (
    <div key={msg.id} id={`msg-${msg.id}`}>
      <CallTranscriptBubble transcript={transcriptMeta} preview={msg.ciphertext} />
    </div>
  );
}

export function MessageStreamCallSystemRow({
  msg,
  callMeta,
  isMe,
  userId,
  isDirectChat,
  callPhase,
  activeId,
  peer,
  onStartCall,
}: Readonly<{
  msg: Message;
  callMeta: NonNullable<MessageKindFlags['callMeta']>;
  isMe: boolean;
  userId: string;
  isDirectChat: boolean;
  callPhase: string;
  activeId: string | null;
  peer?: ActiveChatPeer;
  onStartCall: (args: {
    chatId: string;
    peerUserId: string;
    peerDisplayName: string;
    video: boolean;
  }) => void;
}>) {
  const canRedial = isDirectChat && peer && callPhase === 'idle' && activeId;
  return (
    <div key={msg.id} id={`msg-${msg.id}`}>
      <CallMessageBubble
        call={callMeta}
        ciphertext={msg.ciphertext}
        isMe={isMe}
        myUserId={userId}
        onRedial={
          canRedial
            ? handler(() => {
                if (!activeId) return;
                onStartCall({
                  chatId: activeId,
                  peerUserId: peer.id,
                  peerDisplayName: peer.displayName || peer.email || 'Contact',
                  video: callMeta.kind === 'VIDEO',
                });
              })
            : undefined
        }
      />
    </div>
  );
}
