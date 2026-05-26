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

class SocketService {
  private socket: Socket | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners: Map<string, Set<(...args: any[]) => void>> = new Map();
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
      if (!this.intentionalDisconnect && this.socket && !this.socket.connected) {
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

    this.socket.on('message:new', (data) => {
      this.trigger('message:new', data);
    });

    this.socket.on('poll:updated', (data) => {
      this.trigger('poll:updated', data);
    });

    this.socket.on('typing:update', (data) => {
      this.trigger('typing:update', data);
    });

    this.socket.on('presence:changed', (data) => {
      this.trigger('presence:changed', data);
    });

    this.socket.on('receipt:read', (data) => {
      this.trigger('receipt:read', data);
    });

    this.socket.on('receipt:delivered', (data) => {
      this.trigger('receipt:delivered', data);
    });

    this.socket.on('reaction:added', (data) => {
      this.trigger('reaction:added', data);
    });

    this.socket.on('reaction:removed', (data) => {
      this.trigger('reaction:removed', data);
    });

    this.socket.on('message:updated', (data) => {
      this.trigger('message:updated', data);
    });

    this.socket.on('message:deleted', (data) => {
      this.trigger('message:deleted', data);
    });

    this.socket.on('message:pinned', (data) => {
      this.trigger('message:pinned', data);
    });

    this.socket.on('message:unpinned', (data) => {
      this.trigger('message:unpinned', data);
    });

    this.socket.on('session:revoked', (data) => {
      this.trigger('session:revoked', data);
    });

    this.socket.on('user:profile:updated', (data) => {
      this.trigger('user:profile:updated', data);
    });

    this.socket.on('user:block:updated', (data) => {
      this.trigger('user:block:updated', data);
    });

    this.socket.on('call:incoming', (data) => {
      this.trigger('call:incoming', data);
    });

    this.socket.on('call:ringing', (data) => {
      this.trigger('call:ringing', data);
    });

    this.socket.on('call:answered', (data) => {
      this.trigger('call:answered', data);
    });

    this.socket.on('call:rejected', (data) => {
      this.trigger('call:rejected', data);
    });

    this.socket.on('call:ended', (data) => {
      this.trigger('call:ended', data);
    });

    this.socket.on('call:ice', (data) => {
      this.trigger('call:ice', data);
    });

    this.socket.on('call:busy', (data) => {
      this.trigger('call:busy', data);
    });

    this.socket.on('call:signal', (data) => {
      this.trigger('call:signal', data);
    });

    this.socket.on('call:transcript', (data) => {
      this.trigger('call:transcript', data);
    });
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
      if (this.socket && !this.socket.connected) {
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
