/// <reference lib="WebWorker" />

import {
    ServiceWorkerEvent,
    ServiceWorkerManagerMessage,
} from './utils/registerServiceWorker';

const _self = self as unknown as ServiceWorkerGlobalScope;

const VERSION_CACHE = 'version-cache';
const VERSION_KEY = 'app-version';

_self.addEventListener('install', () => {
    _self.skipWaiting().catch(console.error);
});

_self.addEventListener('activate', (event: ExtendableEvent) => {
    event.waitUntil(_self.clients.claim());
});

export type NEW_VERSION_AVAILABLE_MESSAGE = {
    type: 'NEW_VERSION_AVAILABLE';
    requiresHardRefresh: boolean;
};

export type ServiceWorkerMessageData = NEW_VERSION_AVAILABLE_MESSAGE;

export type ServiceWorkerMessage = ServiceWorkerEvent<ServiceWorkerMessageData>;

interface VersionResponse {
    version: string;
    requiresHardRefresh: boolean;
}

function postMessage(client: Client, message: ServiceWorkerMessageData) {
    return client.postMessage(message);
}

_self.addEventListener('message', async event => {
    const message =
        'type' in event.data ? (event as ServiceWorkerManagerMessage) : null;
    switch (message?.data.type) {
        case 'SET_APP_VERSION': {
            const cache = await caches.open(VERSION_CACHE);
            await cache.put(VERSION_KEY, new Response(message.data.version));
            break;
        }
        case 'NETWORK_STATUS': {
            message.data.online
                ? startCheckingForUpdates()
                : stopCheckingForUpdates();
            break;
        }
        default: {
            console.warn('Unhandled message:', message);
            break;
        }
    }
});

async function checkForUpdates(basePath: string) {
    try {
        const response = await fetch(new URL('/version.json', basePath), {
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
                postMessage(client, {
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

let checkUpdatesInterval: number | undefined;
function startCheckingForUpdates() {
    stopCheckingForUpdates();
    const basePath = _self.registration.scope;

    // does the initial check right away
    setTimeout(() => checkForUpdates(basePath), 0);

    // Check for updates every 5 minutes
    checkUpdatesInterval = setInterval(
        () => checkForUpdates(basePath),
        5 * 1000,
    ) as unknown as number;
}

function stopCheckingForUpdates() {
    if (checkUpdatesInterval) {
        clearInterval(checkUpdatesInterval);
    }
}

startCheckingForUpdates();
