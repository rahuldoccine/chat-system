const CHANNEL_NAME = 'chat-module-sync';
const LEADER_KEY = 'chat-module-leader';
const HEARTBEAT_MS = 2_000;
const LEADER_STALE_MS = 6_000;

export type TabSyncMessage =
  | { type: 'LEADER_CLAIM'; tabId: string; at: number }
  | { type: 'LEADER_HEARTBEAT'; tabId: string; at: number }
  | { type: 'SOCKET_STATE'; connected: boolean; at: number }
  | { type: 'READ_STATE'; chatId: string; at: number }
  | { type: 'OUTBOX_FLUSHED'; at: number };

type LeaderListener = (isLeader: boolean) => void;

let tabId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
let channel: BroadcastChannel | null = null;
let isLeader = true;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
const leaderListeners = new Set<LeaderListener>();

function readLeaderRecord(): { tabId: string; at: number } | null {
  try {
    const raw = localStorage.getItem(LEADER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { tabId: string; at: number };
  } catch {
    return null;
  }
}

function writeLeaderRecord() {
  localStorage.setItem(LEADER_KEY, JSON.stringify({ tabId, at: Date.now() }));
}

function claimLeader() {
  writeLeaderRecord();
  isLeader = true;
  leaderListeners.forEach((fn) => fn(true));
}

function releaseLeader() {
  const rec = readLeaderRecord();
  if (rec?.tabId === tabId) {
    localStorage.removeItem(LEADER_KEY);
  }
  isLeader = false;
  leaderListeners.forEach((fn) => fn(false));
}

function evaluateLeadership() {
  const rec = readLeaderRecord();
  const now = Date.now();
  if (!rec || now - rec.at > LEADER_STALE_MS) {
    claimLeader();
    return;
  }
  if (rec.tabId === tabId) {
    if (!isLeader) {
      isLeader = true;
      leaderListeners.forEach((fn) => fn(true));
    }
    return;
  }
  if (isLeader) {
    isLeader = false;
    leaderListeners.forEach((fn) => fn(false));
  }
}

function post(msg: TabSyncMessage) {
  channel?.postMessage(msg);
}

export function initTabCoordinator(): boolean {
  if (typeof BroadcastChannel === 'undefined') {
    return true;
  }

  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (ev: MessageEvent<TabSyncMessage>) => {
    const msg = ev.data;
    if (msg.type === 'LEADER_CLAIM' || msg.type === 'LEADER_HEARTBEAT') {
      evaluateLeadership();
    }
  };

  claimLeader();
  post({ type: 'LEADER_CLAIM', tabId, at: Date.now() });

  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    evaluateLeadership();
    if (isLeader) {
      writeLeaderRecord();
      post({ type: 'LEADER_HEARTBEAT', tabId, at: Date.now() });
    }
  }, HEARTBEAT_MS);

  window.addEventListener('storage', (e) => {
    if (e.key === LEADER_KEY) evaluateLeadership();
  });

  return isLeader;
}

export function shutdownTabCoordinator() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  releaseLeader();
  channel?.close();
  channel = null;
}

export function isTabLeader(): boolean {
  if (typeof BroadcastChannel === 'undefined') return true;
  return isLeader;
}

export function onTabLeadershipChange(listener: LeaderListener): () => void {
  leaderListeners.add(listener);
  listener(isLeader);
  return () => leaderListeners.delete(listener);
}

export function broadcastSocketState(connected: boolean) {
  post({ type: 'SOCKET_STATE', connected, at: Date.now() });
}

export function broadcastReadState(chatId: string) {
  post({ type: 'READ_STATE', chatId, at: Date.now() });
}

export function broadcastOutboxFlushed() {
  post({ type: 'OUTBOX_FLUSHED', at: Date.now() });
}

export function subscribeTabSync(
  handler: (msg: TabSyncMessage) => void,
): () => void {
  if (!channel) return () => {};
  const ch = new BroadcastChannel(CHANNEL_NAME);
  ch.onmessage = (ev: MessageEvent<TabSyncMessage>) => handler(ev.data);
  return () => ch.close();
}
