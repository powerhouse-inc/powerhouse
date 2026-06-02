import type {
  PHGlobal,
  PHGlobalKey,
  SetEvent,
} from "@powerhousedao/reactor-browser";
import { capitalCase } from "change-case";
import { useSyncExternalStore } from "react";

// guard condition for server side rendering
const isServer = typeof window === "undefined";

export function makePHEventFunctions<TKey extends PHGlobalKey>(key: TKey) {
  const setEventName = `ph:set${capitalCase(key)}` as const;
  const updateEventName = `ph:${key}Updated` as const;

  function setValue(value: PHGlobal[TKey] | undefined) {
    if (isServer) {
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
    const value = event.detail[key];
    if (!window.ph) {
      window.ph = {};
    }
    window.ph[key] = value;
    dispatchUpdatedEvent();
  }

  function addEventHandler() {
    if (isServer) {
      return;
    }
    window.addEventListener(setEventName, handleSetValueEvent as EventListener);
  }

  function subscribeToValue(onStoreChange: () => void) {
    if (isServer) return () => {};
    window.addEventListener(updateEventName, onStoreChange);
    return () => {
      window.removeEventListener(updateEventName, onStoreChange);
    };
  }

  function getSnapshot() {
    if (isServer) {
      return undefined;
    }
    // The store is legitimately read before the first `setValue` (subscribers
    // mount before init runs), so an uninitialized store is expected, not an
    // error — return `undefined` quietly rather than warning on every render.
    return window.ph?.[key];
  }

  function getServerSnapshot() {
    return undefined;
  }

  function useValue() {
    return useSyncExternalStore(
      subscribeToValue,
      getSnapshot,
      getServerSnapshot,
    );
  }

  return {
    useValue,
    setValue,
    addEventHandler,
  };
}
