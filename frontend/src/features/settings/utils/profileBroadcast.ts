import type { ProfileBroadcast } from './syncProfileCaches';

const CHANNEL_NAME = 'chat-system-profile-updated';

export type ProfileBroadcastMessage = ProfileBroadcast & { email: string };

/** Notify other browser tabs about a profile change (same origin). */
export function broadcastProfileToOtherTabs(profile: ProfileBroadcastMessage): void {
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(profile);
    channel.close();
  } catch {
    // BroadcastChannel not available (very old browsers / SSR).
  }
}

export function subscribeProfileBroadcast(
  handler: (profile: ProfileBroadcastMessage) => void,
): () => void {
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<ProfileBroadcastMessage>) => {
      if (event.data?.id) handler(event.data);
    };
    return () => channel.close();
  } catch {
    return () => undefined;
  }
}
