import { type Reactor } from "../types/reactor.js";
import { type SetReactorEvent } from "./types.js";

export function dispatchSetReactorEvent(reactor: Reactor | undefined) {
  const event = new CustomEvent("ph:setReactor", {
    detail: { reactor },
  });
  window.dispatchEvent(event);
}
export function dispatchReactorUpdatedEvent() {
  const event = new CustomEvent("ph:reactorUpdated");
  window.dispatchEvent(event);
}
export function handleSetReactorEvent(event: SetReactorEvent) {
  const reactor = event.detail.reactor;
  window.reactor = reactor;
  dispatchReactorUpdatedEvent();
}

export function subscribeToReactor(onStoreChange: () => void) {
  window.addEventListener("ph:reactorUpdated", onStoreChange);
  return () => {
    window.removeEventListener("ph:reactorUpdated", onStoreChange);
  };
}

export function addReactorEventHandler() {
  window.addEventListener("ph:setReactor", handleSetReactorEvent);
}
