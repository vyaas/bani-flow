// Minimal service worker — satisfies PWA installability requirement.
// No offline caching is implemented; the app requires network access for
// YouTube embeds and Cytoscape CDN.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
