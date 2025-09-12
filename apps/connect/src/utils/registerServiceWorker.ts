import { connectConfig } from "@powerhousedao/connect/config";

const VERSION_CHECK_INTERVAL =
  parseInt(import.meta.env.PH_CONNECT_VERSION_CHECK_INTERVAL) || 60 * 60 * 1000; // 1 hour;

const basePath = connectConfig.routerBasename;

const serviceWorkerScriptPath = [basePath, "service-worker.js"]
  .join("/")
  .replace(/\/{2,}/gm, "/");

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

  #handleServiceWorkerMessage(
    event: MessageEvent<{
      type: "NEW_VERSION_AVAILABLE";
      version: string;
      requiresHardRefresh: boolean;
    }>,
  ) {
    if (this.debug) {
      console.log("ServiceWorker message: ", event);
    }
    const message = "type" in event.data ? event : null;
    switch (message?.data.type) {
      case "NEW_VERSION_AVAILABLE": {
        if (message.data.version === connectConfig.appVersion) {
          return;
        }
        if (message.data.requiresHardRefresh) {
          if (this.debug) {
            console.log("New version available");
          }

          window.location.reload(); // Reload the page to load the new version
        }
        break;
      }
      default: {
        console.warn("Unhandled message:", message);
        break;
      }
    }
  }

  #handleServiceWorker(registration: ServiceWorkerRegistration) {
    {
      // Listen for messages from the service worker
      if (this.debug) {
        console.log("ServiceWorker registered: ", registration);
      }

      navigator.serviceWorker.addEventListener(
        "message",
        this.#handleServiceWorkerMessage.bind(this),
      );

      this.registration = registration;
      this.ready = true;
    }
  }

  registerServiceWorker(debug = false) {
    this.debug = debug;

    if (!("serviceWorker" in navigator)) {
      console.warn("Service Worker not available");
      return;
    }
    window.addEventListener("load", async () => {
      try {
        // checks if there is a service worker installed already and calls
        // its the update method to check if there is a new version available
        const existingRegistration =
          await navigator.serviceWorker.getRegistration();
        if (existingRegistration) {
          await existingRegistration.update();
          this.#handleServiceWorker(existingRegistration);
        }

        // if no service worker is installed then registers the service worker
        else {
          const registration = await navigator.serviceWorker.register(
            serviceWorkerScriptPath,
          );
          this.#handleServiceWorker(registration);

          registration.addEventListener("updatefound", () => {
            this.#handleServiceWorker(registration);
          });
        }

        // calls the update on an interval to force
        // the browser to check for a new version
        const intervalId = setInterval(async () => {
          const existingRegistration =
            await navigator.serviceWorker.getRegistration();
          if (existingRegistration) {
            await existingRegistration.update();
          } else {
            clearInterval(intervalId);
            this.registerServiceWorker();
          }
        }, VERSION_CHECK_INTERVAL);
      } catch (error) {
        console.error("ServiceWorker registration failed: ", error);
      }
    });
  }
}

export const serviceWorkerManager = new ServiceWorkerManager();
