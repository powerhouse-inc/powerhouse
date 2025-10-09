import type { AppConfig } from "@powerhousedao/reactor-browser";
import type { SetAppConfigEvent, SetBasePathEvent } from "./types.js";

export function dispatchSetBasePathEvent(basePath: string | undefined) {
  const event = new CustomEvent("ph:setBasePath", {
    detail: { basePath },
  });
  window.dispatchEvent(event);
}

export function dispatchBasePathUpdatedEvent(basePath: string | undefined) {
  const event = new CustomEvent("ph:basePathUpdated", {
    detail: { basePath },
  });
  window.dispatchEvent(event);
}

export function handleSetBasePathEvent(event: SetBasePathEvent) {
  window.basePath = event.detail.basePath ?? "/";
  dispatchBasePathUpdatedEvent(event.detail.basePath);
}

export function addBasePathEventHandler() {
  window.addEventListener("ph:setBasePath", handleSetBasePathEvent);
}

export function dispatchSetAppConfigEvent(appConfig: AppConfig | undefined) {
  const event = new CustomEvent("ph:setAppConfig", {
    detail: { appConfig },
  });
  window.dispatchEvent(event);
}

export function dispatchAppConfigUpdatedEvent() {
  const event = new CustomEvent("ph:appConfigUpdated");
  window.dispatchEvent(event);
}

export function handleSetAppConfigEvent(event: SetAppConfigEvent) {
  const appConfig = event.detail.appConfig;
  window.phAppConfig = appConfig;
  dispatchAppConfigUpdatedEvent();
}

export function subscribeToAppConfig(onStoreChange: () => void) {
  window.addEventListener("ph:appConfigUpdated", onStoreChange);
  return () => {
    window.removeEventListener("ph:appConfigUpdated", onStoreChange);
  };
}

export function addAppConfigEventHandler() {
  window.addEventListener("ph:setAppConfig", handleSetAppConfigEvent);
}
