import type {
  PHGlobal,
  PHGlobalKey,
  SetEvent,
} from "@powerhousedao/reactor-browser";
import { capitalCase } from "change-case";
import { useSyncExternalStore } from "react";

export function makePHEventFunctions<TKey extends PHGlobalKey>(key: TKey) {
  const setEventName = `ph:set${capitalCase(key)}` as const;
  const updateEventName = `ph:${key}Updated` as const;

  function setValue(value: PHGlobal[TKey] | undefined) {
    const event = new CustomEvent(setEventName, {
      detail: { [key]: value },
    });
    window.dispatchEvent(event);
  }

  function dispatchUpdatedEvent() {
    const event = new CustomEvent(updateEventName);
    window.dispatchEvent(event);
  }

  function handleSetValueEvent(event: SetEvent<TKey>) {
    const value = event.detail[key];
    if (!window.ph) throw new Error("ph global store is not defined");
    window.ph[key] = value;
    dispatchUpdatedEvent();
  }

  function addEventHandler() {
    window.addEventListener(setEventName, handleSetValueEvent as EventListener);
  }

  function subscribeToValue(onStoreChange: () => void) {
    window.addEventListener(updateEventName, onStoreChange);
    return () => {
      window.removeEventListener(updateEventName, onStoreChange);
    };
  }

  function getSnapshot() {
    if (!window.ph) throw new Error("ph global store is not defined");
    return window.ph[key];
  }

  function useValue() {
    return useSyncExternalStore(subscribeToValue, getSnapshot);
  }

  return {
    useValue,
    setValue,
    addEventHandler,
  };
}
