import { makePHEventFunctions } from "@powerhousedao/reactor-browser";

export const {
  useValue: useConnectCrypto,
  setValue: setConnectCrypto,
  addEventHandler: addConnectCryptoEventHandler,
} = makePHEventFunctions("connectCrypto");

export const {
  useValue: useDid,
  setValue: setDid,
  addEventHandler: addDidEventHandler,
} = makePHEventFunctions("did");

export function useSign() {
  const connectCrypto = useConnectCrypto();
  return connectCrypto?.sign;
}
