const VERSION_CACHE = 'version-cache';
const VERSION_KEY = 'app-version';

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});


self.addEventListener('message', async event => {
    if (event.data && event.data.type === 'SET_APP_VERSION') {
        const cache = await caches.open(VERSION_CACHE);
        await cache.put(VERSION_KEY, new Response(event.data.version));
    }
  });

async function checkForUpdates() {
    try {
        const response = await fetch('/version.json', { cache: 'no-store' });
        const newVersion = await response.json();
        const cache = await caches.open(VERSION_CACHE);
        const cachedResponse = await cache.match(VERSION_KEY);

        let currentVersion = '';

        if (cachedResponse) {
            currentVersion = await cachedResponse.text();
        }
    
        if (currentVersion === '') {
            // Initial cache
            await cache.put(VERSION_KEY, new Response(newVersion.version));
        } else if (currentVersion !== newVersion.version) {
            // New version detected
            console.log('Current version:', currentVersion);
            console.log('New version:', newVersion.version);

            const clients = await self.clients.matchAll();
            clients.forEach(client => {
                client.postMessage({ type: 'NEW_VERSION_AVAILABLE', requiresHardRefresh: newVersion.requiresHardRefresh });
            });

            // Update the stored version
            await cache.put(VERSION_KEY, new Response(newVersion.version));
        }
    } catch (error) {
        console.error('Error checking version:', error);
    }
}

// Check for updates every minute
setInterval(checkForUpdates, 60 * 1000); // 60 seconds
