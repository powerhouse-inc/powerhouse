import type { DID, IConnectCrypto } from "@powerhousedao/reactor-browser";
import type { SetConnectCryptoEvent, SetDidEvent } from "./types.js";

export function dispatchSetConnectCryptoEvent(
  connectCrypto: IConnectCrypto | undefined,
) {
  const event = new CustomEvent("ph:setConnectCrypto", {
    detail: { connectCrypto },
  });
  window.dispatchEvent(event);
}
export function dispatchConnectCryptoUpdatedEvent() {
  const event = new CustomEvent("ph:connectCryptoUpdated");
  window.dispatchEvent(event);
}
export function handleSetConnectCryptoEvent(event: SetConnectCryptoEvent) {
  const connectCrypto = event.detail.connectCrypto;
  window.connectCrypto = connectCrypto;
  dispatchConnectCryptoUpdatedEvent();
}

export function subscribeToConnectCrypto(onStoreChange: () => void) {
  window.addEventListener("ph:connectCryptoUpdated", onStoreChange);
  return () => {
    window.removeEventListener("ph:connectCryptoUpdated", onStoreChange);
  };
}

export function addConnectCryptoEventHandler() {
  window.addEventListener("ph:setConnectCrypto", handleSetConnectCryptoEvent);
}

export function dispatchSetDidEvent(did: DID | undefined) {
  const event = new CustomEvent("ph:setDid", {
    detail: { did },
  });
  window.dispatchEvent(event);
}

export function dispatchDidUpdatedEvent() {
  const event = new CustomEvent("ph:didUpdated");
  window.dispatchEvent(event);
}
export function handleSetDidEvent(event: SetDidEvent) {
  const did = event.detail.did;
  window.did = did;
  dispatchDidUpdatedEvent();
}

export function subscribeToDid(onStoreChange: () => void) {
  window.addEventListener("ph:didUpdated", onStoreChange);
  return () => {
    window.removeEventListener("ph:didUpdated", onStoreChange);
  };
}

export function addDidEventHandler() {
  window.addEventListener("ph:setDid", handleSetDidEvent);
}
