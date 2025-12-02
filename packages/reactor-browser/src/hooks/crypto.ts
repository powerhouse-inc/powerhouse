import type { IConnectCrypto } from "@renown/sdk";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const connectCryptoEventFunctions = makePHEventFunctions("connectCrypto");

/** Returns the current ConnectCrypto instance */
export const useConnectCrypto: () => IConnectCrypto | undefined =
  connectCryptoEventFunctions.useValue;

/** Sets the current ConnectCrypto instance */
export const setConnectCrypto: (value: IConnectCrypto | undefined) => void =
  connectCryptoEventFunctions.setValue;

/** Adds an event handler for ConnectCrypto changes */
export const addConnectCryptoEventHandler: () => void =
  connectCryptoEventFunctions.addEventHandler;

export function useSign() {
  const connectCrypto = useConnectCrypto();
  return connectCrypto?.sign;
}
