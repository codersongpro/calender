// Intentionally does not cache or intercept requests: this app always needs
// fresh data, so the only job of this service worker is to satisfy the
// "installable" requirement some browsers check before allowing an
// add-to-home-screen / desktop shortcut prompt.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
