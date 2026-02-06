import {
  compressedKeyInHexfromRaw,
  encodeDIDfromHexString,
  rawKeyInHexfromUncompressed,
} from "did-key-creator";
import type {
  Action,
  ISigner,
  Operation,
  Signature,
  SignatureVerificationHandler,
} from "document-model";
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

/**
 * Signs an action with the provided signer, adding signer context and signature.
 *
 * @param action - The action to sign
 * @param signer - The signer implementing ISigner interface
 * @param signal - Optional abort signal for cancellation
 * @returns The action with signer context populated (user, app, signatures)
 */
export const signAction = async (
  action: Action,
  signer: ISigner,
  signal?: AbortSignal,
): Promise<Action> => {
  const signature: Signature = await signer.signAction(action, signal);

  return {
    ...action,
    context: {
      ...action.context,
      signer: {
        user: {
          address: signer.user?.address || "",
          networkId: signer.user?.networkId || "",
          chainId: signer.user?.chainId || 0,
        },
        app: {
          name: signer.app?.name || "",
          key: signer.app?.key || "",
        },
        signatures: [signature],
      },
    },
  };
};

/**
 * Signs multiple actions with the provided signer.
 *
 * @param actions - The actions to sign
 * @param signer - The signer implementing ISigner interface
 * @param signal - Optional abort signal for cancellation
 * @returns Array of actions with signer context populated
 */
export const signActions = async (
  actions: Action[],
  signer: ISigner,
  signal?: AbortSignal,
): Promise<Action[]> => {
  return Promise.all(
    actions.map((action) => signAction(action, signer, signal)),
  );
};

/**
 * Creates a signature verification handler that verifies signatures using the Web Crypto API.
 * The verification uses ECDSA with P-256 curve and SHA-256 hash, matching the RenownCrypto signing algorithm.
 */
export function createSignatureVerifier(): SignatureVerificationHandler {
  return async (operation: Operation, publicKey: string): Promise<boolean> => {
    const signer = operation.action.context?.signer;
    if (!signer) {
      return true;
    }

    const signatures = signer.signatures;
    if (signatures.length === 0) {
      return false;
    }

    const signature = signatures[signatures.length - 1];
    const [timestamp, signerKey, hash, prevStateHash, signatureHex] = signature;

    if (signerKey !== publicKey) {
      return false;
    }

    const params: [string, string, string, string] = [
      timestamp,
      signerKey,
      hash,
      prevStateHash,
    ];
    const message = buildSignatureMessage(params);
    const signatureBytes = hexToUint8Array(signatureHex);

    const cryptoKey = await importPublicKey(publicKey);

    const isValid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      signatureBytes.buffer as ArrayBuffer,
      message.buffer as ArrayBuffer,
    );

    return isValid;
  };
}

export function getActionSignature(action: Action): Signature | null {
  const params = action.context?.signer?.signatures.at(-1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!params || params.length !== 5 || !params[4]) {
    return null;
  }
  return params as Signature;
}

export function getActionSignerPublicKey(action: Action): string | null {
  return action.context?.signer?.signatures.at(-1)?.at(1) ?? null;
}

function buildSignatureMessage(
  params: [string, string, string, string],
): Uint8Array {
  const message = params.join("");
  const prefix = "\x19Signed Operation:\n" + message.length.toString();
  const encoder = new TextEncoder();
  return encoder.encode(prefix + message);
}

function hexToUint8Array(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function importPublicKey(did: string): Promise<CryptoKey> {
  const keyData = extractKeyFromDid(did);
  return crypto.subtle.importKey(
    "raw",
    keyData.buffer as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
}

function extractKeyFromDid(did: string): Uint8Array {
  const parts = did.split(":");
  if (parts.length < 3 || parts[0] !== "did" || parts[1] !== "key") {
    throw new Error(`Invalid DID format: ${did}`);
  }

  const multibaseKey = parts[2];
  if (!multibaseKey.startsWith("z")) {
    throw new Error(`Unsupported multibase encoding: ${multibaseKey[0]}`);
  }

  const decoded = base58Decode(multibaseKey.slice(1));

  if (decoded[0] !== 0x80 || decoded[1] !== 0x24) {
    throw new Error("Not a P-256 public key multicodec");
  }

  const compressedKey = decoded.slice(2);
  return decompressP256PublicKey(compressedKey);
}

function base58Decode(input: string): Uint8Array {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const ALPHABET_MAP = new Map<string, number>();
  for (let i = 0; i < ALPHABET.length; i++) {
    ALPHABET_MAP.set(ALPHABET[i], i);
  }

  if (input.length === 0) {
    return new Uint8Array(0);
  }

  const bytes: number[] = [0];
  for (const char of input) {
    const value = ALPHABET_MAP.get(char);
    if (value === undefined) {
      throw new Error(`Invalid base58 character: ${char}`);
    }

    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (const char of input) {
    if (char !== "1") break;
    bytes.push(0);
  }

  return new Uint8Array(bytes.reverse());
}

function decompressP256PublicKey(compressed: Uint8Array): Uint8Array {
  if (compressed.length !== 33) {
    throw new Error(`Invalid compressed key length: ${compressed.length}`);
  }

  const prefix = compressed[0];
  if (prefix !== 0x02 && prefix !== 0x03) {
    throw new Error(`Invalid compression prefix: ${prefix}`);
  }

  const p = BigInt(
    "0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff",
  );
  const a = BigInt(
    "0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc",
  );
  const b = BigInt(
    "0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b",
  );

  let x = BigInt(0);
  for (let i = 1; i < compressed.length; i++) {
    x = (x << BigInt(8)) | BigInt(compressed[i]);
  }

  const ySquared = (modPow(x, BigInt(3), p) + a * x + b) % p;
  let y = modPow(ySquared, (p + BigInt(1)) / BigInt(4), p);

  const isYEven = y % BigInt(2) === BigInt(0);
  const shouldBeEven = prefix === 0x02;
  if (isYEven !== shouldBeEven) {
    y = p - y;
  }

  const uncompressed = new Uint8Array(65);
  uncompressed[0] = 0x04;

  const xBytes = bigIntToBytes(x, 32);
  const yBytes = bigIntToBytes(y, 32);

  uncompressed.set(xBytes, 1);
  uncompressed.set(yBytes, 33);

  return uncompressed;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = BigInt(1);
  base = base % mod;
  while (exp > BigInt(0)) {
    if (exp % BigInt(2) === BigInt(1)) {
      result = (result * base) % mod;
    }
    exp = exp >> BigInt(1);
    base = (base * base) % mod;
  }
  return result;
}

function bigIntToBytes(n: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(n & BigInt(0xff));
    n = n >> BigInt(8);
  }
  return bytes;
}
