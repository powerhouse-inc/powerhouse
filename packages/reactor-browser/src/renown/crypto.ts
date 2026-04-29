import { BrowserKeyStorage, RenownCryptoBuilder } from "@renown/sdk";

/**
 * @deprecated Use {@link initRenownCrypto} instead
 *
 * Initialize ConnectCrypto
 * @returns ConnectCrypto instance
 */
export async function initConnectCrypto() {
  return initRenownCrypto();
}

/**
 * Initialize RenownCrypto
 * @returns RenownCrypto instance
 */
export async function initRenownCrypto() {
  const keyStorage = await BrowserKeyStorage.create();
  return await new RenownCryptoBuilder().withKeyPairStorage(keyStorage).build();
}
