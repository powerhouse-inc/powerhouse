import {
  compressedKeyInHexfromRaw,
  encodeDIDfromHexString,
  rawKeyInHexfromUncompressed,
} from "did-key-creator";
import type { DID, JwkKeyPair } from "./types.js";

export const ECDSA_ALGORITHM: EcKeyAlgorithm = {
  name: "ECDSA",
  namedCurve: "P-256",
};

export const ECDSA_SIGN_ALGORITHM = {
  name: "ECDSA",
  namedCurve: "P-256",
  hash: "SHA-256",
};

export function ab2hex(ab: ArrayBuffer): string {
  return Array.prototype.map
    .call(new Uint8Array(ab), (x: number) => ("00" + x.toString(16)).slice(-2))
    .join("");
}

export async function parseDid(
  keyPair: CryptoKeyPair,
  subtleCrypto: SubtleCrypto,
): Promise<DID> {
  const publicKeyRaw = await subtleCrypto.exportKey("raw", keyPair.publicKey);
  const multicodecName = "p256-pub";
  const rawKey = rawKeyInHexfromUncompressed(ab2hex(publicKeyRaw));
  const compressedKey = compressedKeyInHexfromRaw(rawKey);
  const did = encodeDIDfromHexString(multicodecName, compressedKey);
  return did as DID;
}

export async function exportKeyPair(
  keyPair: CryptoKeyPair,
  subtleCrypto: SubtleCrypto,
): Promise<JwkKeyPair> {
  return {
    publicKey: await subtleCrypto.exportKey("jwk", keyPair.publicKey),
    privateKey: await subtleCrypto.exportKey("jwk", keyPair.privateKey),
  };
}

export async function importKeyPair(
  jwkKeyPair: JwkKeyPair,
  subtleCrypto: SubtleCrypto,
  algorithm: EcKeyAlgorithm = ECDSA_ALGORITHM,
): Promise<CryptoKeyPair> {
  return {
    publicKey: await subtleCrypto.importKey(
      "jwk",
      jwkKeyPair.publicKey,
      algorithm,
      true,
      ["verify"],
    ),
    privateKey: await subtleCrypto.importKey(
      "jwk",
      jwkKeyPair.privateKey,
      algorithm,
      true,
      ["sign"],
    ),
  };
}

export async function generateKeyPair(
  subtleCrypto: SubtleCrypto,
  algorithm: EcKeyAlgorithm = ECDSA_ALGORITHM,
): Promise<CryptoKeyPair> {
  return subtleCrypto.generateKey(algorithm, true, ["sign", "verify"]);
}
