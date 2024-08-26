/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import connectConfig from 'connect-config';

const serviceWorkerScriptPath = [
    connectConfig.routerBasename,
    'service-worker.js',
]
    .join('/')
    .replace(/\/{2,}/gm, '/');

type SET_APP_VERSION_MESSAGE = {
    type: 'SET_APP_VERSION';
    version: string;
};

export type ServiceWorkerPostMessage = SET_APP_VERSION_MESSAGE;

type NEW_VERSION_AVAILABLE_MESSAGE = {
    type: 'NEW_VERSION_AVAILABLE';
    requiresHardRefresh: boolean;
};

export type ServiceWorkerMessage = NEW_VERSION_AVAILABLE_MESSAGE;

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

    registerServiceWorker(debug = false) {
        this.debug = debug;

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker
                    .register(serviceWorkerScriptPath)
                    .then(registration => {
                        // Listen for messages from the service worker
                        if (this.debug) {
                            console.log(
                                'ServiceWorker registered: ',
                                registration,
                            );
                        }

                        navigator.serviceWorker.addEventListener(
                            'message',
                            event => {
                                if (this.debug) {
                                    console.log(
                                        'ServiceWorker message: ',
                                        event,
                                    );
                                }

                                if (
                                    event.data &&
                                    event.data.type ===
                                        'NEW_VERSION_AVAILABLE' &&
                                    event.data.requiresHardRefresh === true
                                ) {
                                    if (this.debug) {
                                        console.log('New version available');
                                    }
                                    window.location.reload(); // Reload the page to load the new version
                                }
                            },
                        );

                        if (navigator.serviceWorker.controller) {
                            navigator.serviceWorker.controller.postMessage({
                                type: 'SET_APP_VERSION',
                                version: process.env.APP_VERSION,
                            });
                        }

                        this.ready = true;
                        this.registration = registration;
                    })
                    .catch(error => {
                        console.error(
                            'ServiceWorker registration failed: ',
                            error,
                        );
                    });
            });
        }
    }

    sendMessage(message: ServiceWorkerPostMessage) {
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
