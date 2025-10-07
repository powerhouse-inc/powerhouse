import { makePHEventFunctions } from "@powerhousedao/reactor-browser";
import type { DID, IConnectCrypto } from "@renown/sdk";

export const {
  useValue: useConnectCrypto,
  setValue: setConnectCrypto,
  addEventHandler: addConnectCryptoEventHandler,
} = makePHEventFunctions<IConnectCrypto>("connectCrypto");

export const {
  useValue: useDid,
  setValue: setDid,
  addEventHandler: addDidEventHandler,
} = makePHEventFunctions<DID>("did");

export function useSign() {
  const connectCrypto = useConnectCrypto();
  return connectCrypto?.sign;
}
