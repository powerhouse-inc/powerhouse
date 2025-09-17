import {
  subscribeToConnectCrypto,
  subscribeToDid,
} from "@powerhousedao/reactor-browser";
import { useSyncExternalStore } from "react";

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
