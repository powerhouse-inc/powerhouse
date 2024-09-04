/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import connectConfig from 'connect-config';
import { ServiceWorkerMessage } from 'src/service-worker';

const basePath = connectConfig.routerBasename;

const serviceWorkerScriptPath = [basePath, 'service-worker.js']
    .join('/')
    .replace(/\/{2,}/gm, '/');

export interface IServiceWorkerMessageData {
    type: string;
}

export interface ServiceWorkerEvent<T extends IServiceWorkerMessageData>
    extends ExtendableMessageEvent {
    data: T;
}

export type SET_APP_VERSION = {
    type: 'SET_APP_VERSION';
    version: string;
};

export type NETWORK_STATUS = {
    type: 'NETWORK_STATUS';
    online: boolean;
};

export type ServiceWorkerManagerMessageData = SET_APP_VERSION | NETWORK_STATUS;

export type ServiceWorkerManagerMessage =
    ServiceWorkerEvent<ServiceWorkerManagerMessageData>;

class ServiceWorkerManager {
    ready = false;
    debug = false;
    registration: ServiceWorkerRegistration | null = null;

    constructor(debug = false) {
        this.debug = debug;
    }

    setDebug(debug: boolean) {
        this.debug = debug;
    }

    #handleServiceWorkerMessage(event: MessageEvent | ServiceWorkerMessage) {
        if (this.debug) {
            console.log('ServiceWorker message: ', event);
        }
        const message =
            'type' in event.data ? (event as ServiceWorkerMessage) : null;
        switch (message?.data.type) {
            case 'NEW_VERSION_AVAILABLE': {
                if (message.data.requiresHardRefresh) {
                    if (this.debug) {
                        console.log('New version available');
                    }
                    window.location.reload(); // Reload the page to load the new version
                }
                break;
            }
            default: {
                console.warn('Unhandled message:', message);
                break;
            }
        }
    }

    #handleServiceWorker(registration: ServiceWorkerRegistration) {
        {
            // Listen for messages from the service worker
            if (this.debug) {
                console.log('ServiceWorker registered: ', registration);
            }

            navigator.serviceWorker.addEventListener(
                'message',
                this.#handleServiceWorkerMessage.bind(this),
            );

            this.registration = registration;
            this.ready = true;

            window.addEventListener('online', () => {
                if (navigator.serviceWorker.controller) {
                    this.sendMessage({
                        type: 'NETWORK_STATUS',
                        online: true,
                    });
                }
            });

            window.addEventListener('offline', () => {
                if (navigator.serviceWorker.controller) {
                    this.sendMessage({
                        type: 'NETWORK_STATUS',
                        online: false,
                    });
                }
            });

            if (navigator.serviceWorker.controller) {
                this.sendMessage({
                    type: 'SET_APP_VERSION',
                    version: import.meta.env.APP_VERSION,
                });
            }
        }
    }

    registerServiceWorker(debug = false) {
        this.debug = debug;

        if (!('serviceWorker' in navigator)) {
            console.warn('Service Worker not available');
            return;
        }
        window.addEventListener('load', () => {
            navigator.serviceWorker
                .register(
                    import.meta.env.MODE === 'development'
                        ? './src/service-worker.ts'
                        : serviceWorkerScriptPath,
                )
                .then(this.#handleServiceWorker.bind(this))
                .catch(error => {
                    console.error('ServiceWorker registration failed: ', error);
                });
        });
    }

    sendMessage(message: ServiceWorkerManagerMessageData) {
        if (this.ready && this.registration) {
            const serviceWorker =
                this.registration.active ||
                this.registration.waiting ||
                this.registration.installing;
            if (serviceWorker) {
                if (this.debug) {
                    console.log('Sending message to service worker: ', message);
                }
                serviceWorker.postMessage(message);
            } else {
                console.error('No active service worker found.');
            }
        } else {
            console.error('Service Worker is not ready yet.');
        }
    }
}

const serviceWorkerManager = new ServiceWorkerManager();
export default serviceWorkerManager;
