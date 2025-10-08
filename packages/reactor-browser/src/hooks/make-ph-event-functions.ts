import { capitalCase } from "change-case";
import { useSyncExternalStore } from "react";

type WindowKey = keyof Window;
export function makePHEventFunctions<TValue>(key: WindowKey) {
  if (typeof key !== "string") {
    throw new Error("Key must be a string");
  }
  const setEventName = `ph:set${capitalCase(key)}` as const;
  const updateEventName = `ph:${key}Updated` as const;

  function dispatchSetValueEvent(value: TValue | undefined) {
    const event = new CustomEvent(setEventName, {
      detail: { [key]: value },
    });
    window.dispatchEvent(event);
  }

  function dispatchUpdatedEvent() {
    const event = new CustomEvent(updateEventName);
    window.dispatchEvent(event);
  }

  function handleSetValueEvent(
    event: CustomEvent<{ [K in typeof key]: TValue }>,
  ) {
    const value = event.detail[key];
    (window as Record<WindowKey, any>)[key] = value;
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

  function getSnapshot(): TValue | undefined {
    const value = (window as Record<WindowKey, any>)[key] as TValue | undefined;
    return value;
  }

  function useValue() {
    return useSyncExternalStore(subscribeToValue, getSnapshot);
  }

  return {
    setValue: dispatchSetValueEvent,
    useValue,
    addEventHandler,
  };
}
