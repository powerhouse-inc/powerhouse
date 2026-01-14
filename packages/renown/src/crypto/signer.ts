import type {
  Action,
  ISigner,
  Operation,
  Signature,
  SignatureVerificationHandler,
} from "document-model";
import type { IConnectCrypto } from "./index.js";

export class ConnectCryptoSigner implements ISigner {
  private cachedPublicKey: JsonWebKey | undefined;

  constructor(private readonly connectCrypto: IConnectCrypto) {}

  async publicKey(): Promise<JsonWebKey> {
    if (!this.cachedPublicKey) {
      const did = await this.connectCrypto.did();
      const keyData = extractKeyFromDid(did);
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData.buffer as ArrayBuffer,
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["verify"],
      );
      this.cachedPublicKey = await crypto.subtle.exportKey("jwk", cryptoKey);
    }
    return this.cachedPublicKey;
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    return this.connectCrypto.sign(data);
  }

  async verify(data: Uint8Array, signature: Uint8Array): Promise<void> {
    const did = await this.connectCrypto.did();
    const cryptoKey = await importPublicKey(did);
    const isValid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      signature.buffer as ArrayBuffer,
      data.buffer as ArrayBuffer,
    );
    if (!isValid) {
      throw new Error("invalid signature");
    }
  }

  async signAction(
    action: Action,
    abortSignal?: AbortSignal,
  ): Promise<Signature> {
    if (abortSignal?.aborted) {
      throw new Error("Signing aborted");
    }

    const timestamp = (new Date().getTime() / 1000).toFixed(0);
    const did = await this.connectCrypto.did();

    if (abortSignal?.aborted) {
      throw new Error("Signing aborted");
    }

    const hash = await this.hashAction(action);

    if (abortSignal?.aborted) {
      throw new Error("Signing aborted");
    }

    const prevStateHash = action.context?.prevOpHash ?? "";

    const params: [string, string, string, string] = [
      timestamp,
      did,
      hash,
      prevStateHash,
    ];
    const message = this.buildSignatureMessage(params);
    const signatureBytes = await this.connectCrypto.sign(message);
    const signatureHex = `0x${this.arrayBufferToHex(signatureBytes)}`;

    if (abortSignal?.aborted) {
      throw new Error("Signing aborted");
    }

    return [...params, signatureHex];
  }

  private async hashAction(action: Action): Promise<string> {
    const payload = [
      action.scope,
      action.type,
      JSON.stringify(action.input),
    ].join("");
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return this.arrayBufferToBase64(hashBuffer);
  }

  private buildSignatureMessage(
    params: [string, string, string, string],
  ): Uint8Array {
    const message = params.join("");
    const prefix = "\x19Signed Operation:\n" + message.length.toString();
    const encoder = new TextEncoder();
    return encoder.encode(prefix + message);
  }

  private arrayBufferToHex(buffer: Uint8Array | ArrayBuffer): string {
    const bytes =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

/**
 * Creates a signature verification handler that verifies signatures using the Web Crypto API.
 * The verification uses ECDSA with P-256 curve and SHA-256 hash, matching the ConnectCrypto signing algorithm.
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
