import type {
  PHGlobal,
  PHGlobalKey,
  SetEvent,
} from "@powerhousedao/reactor-browser";
import { capitalCase } from "change-case";
import { useSyncExternalStore } from "react";
import {
  getActivePHStore,
  getPHStore,
  getPHStoreSubscribe,
  notifyPHStore,
  subscribePHStore,
  usePHStore,
} from "./ph-store.js";

// guard condition for server side rendering
const isServer = typeof window === "undefined";

const updatedEventName = (key: PHGlobalKey) => `ph:${key}Updated`;

/** Calls `onChange` whenever `key` is set: through the bound store, or the
 * `ph:<key>Updated` event on pages that bound none. */
export function subscribeToPHValue(key: PHGlobalKey, onChange: () => void) {
  if (isServer) return () => {};
  const store = getActivePHStore();
  if (store) return subscribePHStore(store, onChange, key);
  const eventName = updatedEventName(key);
  window.addEventListener(eventName, onChange);
  return () => window.removeEventListener(eventName, onChange);
}

export function makePHEventFunctions<TKey extends PHGlobalKey>(key: TKey) {
  const setEventName = `ph:set${capitalCase(key)}` as const;
  const updateEventName = updatedEventName(key);

  function setValue(value: PHGlobal[TKey] | undefined) {
    if (isServer) {
      return;
    }
    const store = getActivePHStore();
    if (store) {
      const unchanged = store[key] === value;
      store[key] = value;
      // Re-setting a value still notifies, as the event path always has.
      if (unchanged) notifyPHStore(store, key);
      return;
    }
    const event = new CustomEvent(setEventName, {
      detail: { [key]: value },
    });
    window.dispatchEvent(event);
  }

  function dispatchUpdatedEvent() {
    if (isServer) {
      return;
    }
    const event = new CustomEvent(updateEventName);
    window.dispatchEvent(event);
  }

  function handleSetValueEvent(event: SetEvent<TKey>) {
    if (isServer) {
      return;
    }
    if (getActivePHStore()) {
      setValue(event.detail[key]);
      return;
    }
    // No bound store: the page keeps a plain `window.ph`.
    (window.ph ??= {})[key] = event.detail[key];
    dispatchUpdatedEvent();
  }

  // Only pages without a bound store need it; `ph:set*` events still apply.
  function addEventHandler() {
    if (isServer) {
      return;
    }
    window.addEventListener(setEventName, handleSetValueEvent as EventListener);
  }

  function subscribeToValue(onStoreChange: () => void) {
    return subscribeToPHValue(key, onStoreChange);
  }

  function getSnapshot() {
    if (isServer) {
      return undefined;
    }
    // Read before the first setValue is expected: subscribers mount before init.
    return getPHStore()?.[key];
  }

  function getServerSnapshot() {
    return undefined;
  }

  function useValue() {
    const store = usePHStore();
    const readStore = () => store?.[key];
    return useSyncExternalStore(
      store ? getPHStoreSubscribe(store, key) : subscribeToValue,
      store ? readStore : getSnapshot,
      store ? readStore : getServerSnapshot,
    );
  }

  return {
    useValue,
    setValue,
    addEventHandler,
    // Non-React access, e.g. Connect's boot wiring of the reactor worker.
    subscribeToValue,
    getSnapshot,
  };
}
