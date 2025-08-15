import { useSyncExternalStore } from "react";
import { subscribeToConnectCrypto, subscribeToDid } from "../events/index.js";

export function useConnectCrypto() {
  const connectCrypto = useSyncExternalStore(
    subscribeToConnectCrypto,
    () => window.connectCrypto,
  );
  return connectCrypto;
}

export function useDid() {
  const did = useSyncExternalStore(subscribeToDid, () => window.did);
  return did;
}

export function useSign() {
  const connectCrypto = useConnectCrypto();
  return connectCrypto?.sign;
}
