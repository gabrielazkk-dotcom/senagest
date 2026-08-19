self.addEventListener('push', event => {
  let payload = {}
  try {
    payload = event.data?.json() ?? {}
  } catch {
    payload = { body: event.data?.text() }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'SenaGest', {
      body: payload.body || 'Você tem uma nova atualização.',
      icon: '/icons/icon-192x192.png',
      badge: '/badge.png',
      data: { url: payload.url || '/dashboard' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = event.notification.data?.url || '/dashboard'
  event.waitUntil(self.clients.openWindow(target))
})
