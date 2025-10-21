import { makePHEventFunctions } from "./make-ph-event-functions.js";

export const {
  useValue: useConnectCrypto,
  setValue: setConnectCrypto,
  addEventHandler: addConnectCryptoEventHandler,
} = makePHEventFunctions("connectCrypto");

export function useSign() {
  const connectCrypto = useConnectCrypto();
  return connectCrypto?.sign;
}
