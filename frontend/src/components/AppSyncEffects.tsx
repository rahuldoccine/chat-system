import React from 'react';
import ProfileSyncListener from '../features/settings/components/ProfileSyncListener';
import PushSubscriptionSync from '../features/settings/components/PushSubscriptionSync';
import NotificationContextSync from '../features/chat/components/NotificationContextSync';
import ReceiptStatusSync from '../features/chat/components/ReceiptStatusSync';
import AuthChatCacheSync from '../features/chat/components/AuthChatCacheSync';
import ConversationRealtimeSync from '../features/chat/components/ConversationRealtimeSync';

const AppSyncEffects: React.FC = () => (
  <>
    <ProfileSyncListener />
    <PushSubscriptionSync />
    <NotificationContextSync />
    <ReceiptStatusSync />
    <AuthChatCacheSync />
    <ConversationRealtimeSync />
  </>
);

export default AppSyncEffects;
