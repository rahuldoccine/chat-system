import { io, Socket } from 'socket.io-client';
import { env } from '../config/env';
import { getAccessToken, refreshAccessToken, setAccessToken } from '../api/authSession';

const SOCKET_OPTIONS = {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10_000,
  timeout: 20_000,
  transports: ['websocket', 'polling'] as ('websocket' | 'polling')[],
};

/** Server events forwarded to app listeners unchanged. */
const SOCKET_RELAY_EVENTS = [
  'message:new',
  'poll:updated',
  'typing:update',
  'presence:changed',
  'receipt:read',
  'receipt:delivered',
  'reaction:added',
  'reaction:removed',
  'message:updated',
  'message:deleted',
  'message:pinned',
  'message:unpinned',
  'session:revoked',
  'user:profile:updated',
  'user:block:updated',
  'call:incoming',
  'call:ringing',
  'call:answered',
  'call:rejected',
  'call:ended',
  'call:ice',
  'call:busy',
  'call:signal',
  'call:transcript',
  'groupCall:started',
  'groupCall:participantUpdate',
  'groupCall:ended',
  'groupCall:signal',
] as const;

class SocketService {
  private socket: Socket | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly listeners: Map<string, Set<(...args: any[]) => void>> = new Map();
  private authToken: string | null = null;
  private intentionalDisconnect = false;

  private async resolveAuthToken(): Promise<string | null> {
    const existing = getAccessToken() ?? this.authToken;
    if (existing) return existing;
    try {
      const { accessToken } = await refreshAccessToken();
      setAccessToken(accessToken);
      this.authToken = accessToken;
      return accessToken;
    } catch {
      return getAccessToken() ?? this.authToken;
    }
  }

  private async refreshSocketAuth(): Promise<void> {
    if (!this.socket) return;
    const token = await this.resolveAuthToken();
    if (token) {
      this.authToken = token;
      this.socket.auth = { token };
    }
  }

  private bindEngineEvents(): void {
    if (!this.socket) return;
    const manager = this.socket.io;

    manager.off('reconnect_attempt');
    manager.off('reconnect');
    manager.off('reconnect_failed');
    manager.off('reconnect_error');

    manager.on('reconnect_attempt', () => {
      void this.refreshSocketAuth();
      this.trigger('reconnecting');
    });

    manager.on('reconnect', () => {
      this.trigger('reconnect');
    });

    manager.on('reconnect_failed', () => {
      this.trigger('reconnect_failed');
      if (!this.intentionalDisconnect && this.socket?.connected === false) {
        void this.refreshSocketAuth().then(() => this.socket?.connect());
      }
    });

    manager.on('reconnect_error', () => {
      this.trigger('reconnect_error');
    });
  }

  private registerSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Connected to socket server');
      this.trigger('connect');
    });

    this.socket.on('connect_error', (err: Error) => {
      console.warn('Socket connect_error:', err.message);
      this.trigger('connect_error', err);
      void this.refreshSocketAuth();
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log('Disconnected from socket server:', reason);
      this.trigger('disconnect', reason);
    });

    this.socket.on('session:ready', (data) => {
      console.log('Socket session ready:', data);
    });

    for (const event of SOCKET_RELAY_EVENTS) {
      this.socket.on(event, (data) => {
        this.trigger(event, data);
      });
    }
  }

  connect(token: string) {
    this.intentionalDisconnect = false;
    this.authToken = token;

    if (this.socket) {
      this.socket.auth = { token };
      if (!this.socket.connected) {
        void this.refreshSocketAuth().then(() => this.socket?.connect());
      }
      return;
    }

    this.socket = io(env.socketUrl, {
      ...SOCKET_OPTIONS,
      auth: { token },
    });

    this.bindEngineEvents();
    this.registerSocketHandlers();
  }

  /** Nudge reconnect after network recovery or stale connection. */
  reconnect(token?: string) {
    if (token) this.authToken = token;
    if (!this.socket) {
      if (this.authToken) this.connect(this.authToken);
      return;
    }
    this.intentionalDisconnect = false;
    void this.refreshSocketAuth().then(() => {
      if (this.socket?.connected === false) {
        this.socket.connect();
      }
    });
  }

  disconnect() {
    this.intentionalDisconnect = true;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.io.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket() {
    return this.socket;
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: string, data: any, callback?: (response: any) => void) {
    if (!this.socket?.connected) {
      if (callback) {
        callback({
          ok: false,
          code: 'NOT_CONNECTED',
          message: "You're offline. Check your internet connection and try again.",
        });
      }
      return;
    }
    if (callback) {
      this.socket.emit(event, data, callback);
    } else {
      this.socket.emit(event, data);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, callback: (...args: any[]) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string, callback: (...args: any[]) => void) {
    this.listeners.get(event)?.delete(callback);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private trigger(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach((cb) => cb(...args));
  }

  subscribeToChat(chatId: string) {
    this.emit('chat:subscribe', { chatId });
  }

  unsubscribeFromChat(chatId: string) {
    this.emit('chat:unsubscribe', { chatId });
  }

  sendTyping(chatId: string, isTyping: boolean) {
    this.emit(isTyping ? 'typing:start' : 'typing:stop', { chatId });
  }
}

export const socketService = new SocketService();
