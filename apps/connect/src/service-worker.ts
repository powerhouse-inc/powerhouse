/// <reference lib="WebWorker" />

const _self = self as unknown as ServiceWorkerGlobalScope;

const VERSION_CACHE = 'version-cache';
const VERSION_KEY = 'app-version';

_self.addEventListener('install', () => {
    _self.skipWaiting().catch(console.error);
});

_self.addEventListener('activate', (event: ExtendableEvent) => {
    event.waitUntil(_self.clients.claim());
});

interface SeriveWorkerMessage extends ExtendableMessageEvent {
    data: {
        type: string;
        version: string;
    };
}

interface VersionResponse {
    version: string;
    requiresHardRefresh: boolean;
}

_self.addEventListener('message', async (event: SeriveWorkerMessage) => {
    if (event.data && event.data.type === 'SET_APP_VERSION') {
        const cache = await caches.open(VERSION_CACHE);
        await cache.put(VERSION_KEY, new Response(event.data.version));
    }
});

async function checkForUpdates() {
    try {
        const scope = _self.registration.scope;
        const response = await fetch(new URL('/version.json', scope), {
            cache: 'no-store',
        });
        const newVersion = (await response.json()) as VersionResponse;
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

            const clients = await _self.clients.matchAll();
            clients.forEach(client => {
                client.postMessage({
                    type: 'NEW_VERSION_AVAILABLE',
                    requiresHardRefresh: newVersion.requiresHardRefresh,
                });
            });

            // Update the stored version
            await cache.put(VERSION_KEY, new Response(newVersion.version));
        }
    } catch (error) {
        console.error('Error checking version:', error);
    }
}

// Check for updates every minute
setInterval(checkForUpdates, 5 * 1000); // 60 seconds
