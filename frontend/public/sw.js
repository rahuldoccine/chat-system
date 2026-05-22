/* Web Push service worker - served from site root (/sw.js) */

function resolveUrl(path) {
  if (!path || typeof path !== 'string') {
    return self.location.origin + '/';
  }
  try {
    return new URL(path, self.location.origin).href;
  } catch {
    return self.location.origin + '/';
  }
}

self.addEventListener('push', (event) => {
  let payload = { title: 'New message', body: 'You have a new message', url: '/' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = { ...payload, ...parsed };
      }
    }
  } catch {
    /* use defaults */
  }

  const url = resolveUrl(payload.url);
  const isIncomingCall =
    typeof payload.messageId === 'string' && payload.messageId.startsWith('call-incoming-');

  // One tag per message so later pushes in the same chat still alert (not silent replace).
  const tag =
    payload.messageId ||
    (isIncomingCall ? 'incoming-call' : payload.chatId) ||
    undefined;

  event.waitUntil(
    self.registration.showNotification(payload.title || 'New message', {
      body: payload.body || 'You have a new message',
      icon: '/vite.svg',
      badge: '/vite.svg',
      tag,
      renotify: true,
      requireInteraction: isIncomingCall,
      data: {
        url,
        chatId: payload.chatId || null,
        messageId: payload.messageId || null,
        kind: isIncomingCall ? 'incoming_call' : 'message',
      },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = resolveUrl(event.notification.data?.url);

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && typeof client.navigate === 'function') {
            try {
              await client.navigate(targetUrl);
              return;
            } catch {
              /* fall through */
            }
          }
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
