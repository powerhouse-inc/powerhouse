import { encodeDIDFromPub, getPublicKey } from "@didtools/key-webcrypto";
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

export async function parseDid(keyPair: CryptoKeyPair): Promise<DID> {
  return encodeDIDFromPub(await getPublicKey(keyPair)) as DID;
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
