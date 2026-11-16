import { BrowserKeyStorage, RenownCryptoBuilder } from "@renown/sdk";

/**
 * Initialize RenownCrypto
 * @returns RenownCrypto instance
 */
export async function initRenownCrypto() {
  const keyStorage = await BrowserKeyStorage.create();
  return await new RenownCryptoBuilder().withKeyPairStorage(keyStorage).build();
}
