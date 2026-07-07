import { connectConfig } from "@powerhousedao/connect/config";

const basePath = connectConfig.routerBasename;

const serviceWorkerScriptPath = [basePath, "service-worker.js"]
  .join("/")
  .replace(/\/{2,}/gm, "/");

// External store backing the refresh prompt: Workbox (generateSW + prompt mode)
// parks a new worker as "waiting"; we flag that here so
// service-worker-update-prompt.tsx can offer a Refresh instead of reloading
// from under the user.
let updateAvailable = false;
const updateListeners = new Set<() => void>();

function setUpdateAvailable(value: boolean) {
  if (updateAvailable === value) return;
  updateAvailable = value;
  for (const listener of updateListeners) listener();
}

export function subscribeServiceWorkerUpdate(cb: () => void): () => void {
  updateListeners.add(cb);
  return () => {
    updateListeners.delete(cb);
  };
}

export function getServiceWorkerUpdateAvailable(): boolean {
  return updateAvailable;
}

class ServiceWorkerManager {
  ready = false;
  debug = false;
  registration: ServiceWorkerRegistration | null = null;
  // Only reload on controllerchange when the user actually accepted an update.
  // clientsClaim fires controllerchange on the very first install too, and we
  // must not reload then.
  #updateAccepted = false;
  #reloading = false;

  constructor(debug = false) {
    this.debug = debug;
  }

  setDebug(debug: boolean) {
    this.debug = debug;
  }

  #log(...args: unknown[]) {
    if (this.debug) console.log("[ServiceWorker]", ...args);
  }

  // Watch an installing worker; once it reaches "installed" while another
  // worker already controls the page, a new version is waiting → prompt.
  #trackInstalling(worker: ServiceWorker | null) {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        this.#log("New version installed and waiting");
        setUpdateAvailable(true);
      }
    });
  }

  #handleRegistration(registration: ServiceWorkerRegistration) {
    this.registration = registration;
    this.ready = true;
    this.#log("registered", registration);

    // A worker installed by a previous page load may already be waiting.
    if (registration.waiting && navigator.serviceWorker.controller) {
      setUpdateAvailable(true);
    }

    this.#trackInstalling(registration.installing);
    registration.addEventListener("updatefound", () => {
      this.#trackInstalling(registration.installing);
    });
  }

  async #register() {
    try {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        // First visit: boot fetches the runtime config before this SW controls
        // the page, so it never lands in the cache. Warm it now (clientsClaim
        // just gave us control) so a single online load is enough to go offline.
        this.#warmRuntimeConfigCache();
        // Reload once the worker we activated via applyUpdate() takes control.
        if (!this.#updateAccepted || this.#reloading) return;
        this.#reloading = true;
        window.location.reload();
      });

      const existing = await navigator.serviceWorker.getRegistration();
      if (existing) {
        this.#handleRegistration(existing);
        // Force an immediate check so a deploy that happened while the tab was
        // closed surfaces a prompt on the next load.
        await existing.update();
      } else {
        const registration = await navigator.serviceWorker.register(
          serviceWorkerScriptPath,
        );
        this.#handleRegistration(registration);
      }

      // Periodically poll for a new version while the tab stays open.
      const intervalId = setInterval(() => {
        void (async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          if (!reg) {
            clearInterval(intervalId);
            return;
          }
          // Skip while a worker is mid-install or the browser is offline —
          // updating then would only fire a doomed network fetch (per the
          // vite-plugin-pwa periodic-update guidance).
          if (reg.installing || !navigator.onLine) return;
          await reg.update();
        })();
      }, connectConfig.appVersionCheckInterval);
    } catch (error) {
      console.error("ServiceWorker registration failed: ", error);
    }
  }

  registerServiceWorker(debug = false) {
    this.debug = debug;

    if (!("serviceWorker" in navigator)) {
      console.warn("Service Worker not available");
      return;
    }
    const start = () => {
      this.#register().catch(console.error);
    };
    // This runs from a React effect, which usually fires *after* the window
    // `load` event has already happened — so adding a load listener would never
    // fire. Register immediately when the page is already loaded; otherwise wait
    // for load to avoid contending with initial page resource fetches.
    if (document.readyState === "complete") {
      start();
    } else {
      window.addEventListener("load", start, { once: true });
    }
  }

  // Fire-and-forget re-fetch so the controlling SW's NetworkFirst rule caches
  // the config (see controllerchange). The URL MUST match runtime-config.ts's
  // loader (`${import.meta.env.BASE_URL}powerhouse.config.json`) or the cache
  // keys won't line up.
  #warmRuntimeConfigCache() {
    void fetch(`${import.meta.env.BASE_URL}powerhouse.config.json`).catch(
      () => {},
    );
  }

  // Activate the waiting worker; the controllerchange handler then reloads.
  applyUpdate() {
    setUpdateAvailable(false);
    const waiting = this.registration?.waiting;
    if (!waiting) {
      // Nothing waiting (or already activated) — reload to pick up whatever
      // the active worker now serves.
      this.#reloading = true;
      window.location.reload();
      return;
    }
    this.#updateAccepted = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
  }

  sendMessage(message: unknown) {
    const target =
      this.registration?.active ??
      this.registration?.waiting ??
      navigator.serviceWorker.controller;
    target?.postMessage(message);
  }

  // Drop any worker controlling this scope — used when offline support is
  // disabled (a disabled build also ships a self-destroying worker).
  async unregisterAll() {
    if (!("serviceWorker" in navigator)) return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
  }
}

export const serviceWorkerManager = new ServiceWorkerManager();
