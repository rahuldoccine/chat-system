import { enqueuePushNotification } from "../push-queue.js";

export function enqueueIncomingCallPush(params: {
  calleeUserId: string;
  chatId: string;
  callId: string;
  callerName: string;
  isVideo: boolean;
}): void {
  enqueuePushNotification({
    userId: params.calleeUserId,
    chatId: params.chatId,
    messageId: `call-incoming-${params.callId}`,
    title: params.callerName,
    body: params.isVideo ? "Incoming video call" : "Incoming voice call",
  });
}

export function enqueueMissedCallPush(params: {
  recipientUserId: string;
  chatId: string;
  callId: string;
  peerName: string;
}): void {
  enqueuePushNotification({
    userId: params.recipientUserId,
    chatId: params.chatId,
    messageId: `call-missed-${params.callId}`,
    title: params.peerName,
    body: "Missed call",
  });
}
