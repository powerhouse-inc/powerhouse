/// <reference lib="WebWorker" />

interface IServiceWorkerMessageData {
  type: string;
}

interface ServiceWorkerEvent<T extends IServiceWorkerMessageData>
  extends ExtendableMessageEvent {
  data: T;
}

type NEW_VERSION_AVAILABLE_MESSAGE = {
  type: "NEW_VERSION_AVAILABLE";
  version: string;
  requiresHardRefresh: boolean;
};

type ServiceWorkerMessageData = NEW_VERSION_AVAILABLE_MESSAGE;

type ServiceWorkerMessage = ServiceWorkerEvent<ServiceWorkerMessageData>;

const _self = self as unknown as ServiceWorkerGlobalScope;

const APP_VERSION = import.meta.env.PH_CONNECT_VERSION;
const REQUIRES_HARD_REFRESH =
  import.meta.env.PH_CONNECT_REQUIRES_HARD_REFRESH === "true";

const VERSION_CACHE = "version-cache";
const VERSION_KEY = "app-version";

_self.addEventListener("install", () => {
  _self.skipWaiting().catch(console.error);
});

_self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(_self.clients.claim());

  checkAppVersion(APP_VERSION, REQUIRES_HARD_REFRESH).catch(console.error);
});

function postMessage(client: Client, message: ServiceWorkerMessageData) {
  return client.postMessage(message);
}

async function checkAppVersion(version: string, requiresHardRefresh: boolean) {
  try {
    const cache = await caches.open(VERSION_CACHE);
    const cachedResponse = await cache.match(VERSION_KEY);

    let currentVersion = "";

    if (cachedResponse) {
      currentVersion = await cachedResponse.text();
    }

    if (currentVersion === "") {
      // Initial cache
      await cache.put(VERSION_KEY, new Response(version));
    } else if (currentVersion !== version) {
      // New version detected
      console.log("Current version:", currentVersion);
      console.log("New version:", version);

      // Update the stored version
      await cache.put(VERSION_KEY, new Response(version));

      // Update clients
      await updateClients(version, requiresHardRefresh);
    }
  } catch (error) {
    console.error("Error checking version:", error);
  }
}

async function updateClients(version: string, requiresHardRefresh: boolean) {
  await _self.clients.claim();
  const clients = await _self.clients.matchAll();
  clients.forEach((client) => {
    postMessage(client, {
      type: "NEW_VERSION_AVAILABLE",
      version,
      requiresHardRefresh,
    });
  });
}
