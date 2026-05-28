/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
self.skipWaiting()
clientsClaim()

registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'pages',
    networkTimeoutSeconds: 4,
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  }),
)

registerRoute(
  ({ request }) =>
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'worker',
  new StaleWhileRevalidate({
    cacheName: 'static-resources',
    plugins: [new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 14 })],
  }),
)

registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  }),
)

function resolveUrl(path: unknown): string {
  if (!path || typeof path !== 'string') {
    return self.location.origin + '/'
  }
  try {
    return new URL(path, self.location.origin).href
  } catch {
    return self.location.origin + '/'
  }
}

self.addEventListener('push', (event) => {
  let payload: Record<string, unknown> = { title: 'New message', body: 'You have a new message', url: '/' }
  try {
    if (event.data) {
      const parsed = event.data.json()
      if (parsed && typeof parsed === 'object') {
        payload = { ...payload, ...(parsed as Record<string, unknown>) }
      }
    }
  } catch {
    // ignore malformed push payload and fall back to defaults
  }

  const url = resolveUrl(payload.url)
  const messageId = typeof payload.messageId === 'string' ? payload.messageId : undefined
  const chatId = typeof payload.chatId === 'string' ? payload.chatId : undefined
  const isIncomingCall = Boolean(messageId && messageId.startsWith('call-incoming-'))
  const tag = messageId || (isIncomingCall ? 'incoming-call' : chatId) || undefined

  event.waitUntil(
    self.registration.showNotification(
      typeof payload.title === 'string' ? payload.title : 'New message',
      {
        body: typeof payload.body === 'string' ? payload.body : 'You have a new message',
        icon: '/pwa-192x192.svg',
        badge: '/pwa-192x192.svg',
        tag,
        data: {
          url,
          chatId: chatId ?? null,
          messageId: messageId ?? null,
          kind: isIncomingCall ? 'incoming_call' : 'message',
        },
      },
    ),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = resolveUrl((event.notification as Notification).data?.url)

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      for (const client of windowClients) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client && typeof client.navigate === 'function') {
            try {
              await client.navigate(targetUrl)
              return
            } catch {
              // keep searching and fallback to openWindow
            }
          }
          return
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl)
      }
    })(),
  )
})
