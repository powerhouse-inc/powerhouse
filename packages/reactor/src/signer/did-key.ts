import { base58Decode } from "@powerhousedao/shared/document-model";

const DID_KEY_PREFIX = "did:key:z";
const P256_MULTICODEC = [0x80, 0x24] as const;
const MAX_CACHED_KEYS = 1024;

const P = BigInt(
  "0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff",
);
const A = BigInt(
  "0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc",
);
const B = BigInt(
  "0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b",
);

/** A did:key that is not a compressed P-256 public key. */
export class MalformedDidKeyError extends Error {
  constructor(did: string, detail: string) {
    super(`Malformed did:key ${did}: ${detail}`);
    this.name = "MalformedDidKeyError";
  }
}

// Insertion-ordered, so the first key is the least recently used.
const keyCache = new Map<string, CryptoKey>();

/** Cached per process: decompressing the point costs a BigInt modPow. */
export async function importDidKey(did: string): Promise<CryptoKey> {
  const cached = keyCache.get(did);
  if (cached) {
    keyCache.delete(did);
    keyCache.set(did, cached);
    return cached;
  }

  const raw = decompressP256(compressedPointFromDid(did), did);
  const key = await crypto.subtle.importKey(
    "raw",
    raw.buffer as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );

  keyCache.set(did, key);
  if (keyCache.size > MAX_CACHED_KEYS) {
    const oldest = keyCache.keys().next().value;
    if (oldest !== undefined) {
      keyCache.delete(oldest);
    }
  }
  return key;
}

/** Test seam: how many keys the process cache holds. */
export function cachedDidKeyCount(): number {
  return keyCache.size;
}

function compressedPointFromDid(did: string): Uint8Array {
  if (!did.startsWith(DID_KEY_PREFIX)) {
    throw new MalformedDidKeyError(did, "not a base58btc did:key");
  }
  const decoded = base58Decode(did.slice(DID_KEY_PREFIX.length));
  if (!decoded || decoded.length !== 35) {
    throw new MalformedDidKeyError(did, "not a compressed P-256 key");
  }
  if (decoded[0] !== P256_MULTICODEC[0] || decoded[1] !== P256_MULTICODEC[1]) {
    throw new MalformedDidKeyError(did, "not a P-256 multicodec");
  }
  return decoded.subarray(2);
}

function decompressP256(compressed: Uint8Array, did: string): Uint8Array {
  const prefix = compressed[0];
  if (prefix !== 0x02 && prefix !== 0x03) {
    throw new MalformedDidKeyError(did, `compression prefix ${prefix}`);
  }

  let x = BigInt(0);
  for (let i = 1; i < compressed.length; i++) {
    x = (x << BigInt(8)) | BigInt(compressed[i]);
  }
  if (x >= P) {
    throw new MalformedDidKeyError(did, "x outside the field");
  }

  const ySquared = (modPow(x, BigInt(3), P) + A * x + B) % P;
  let y = modPow(ySquared, (P + BigInt(1)) / BigInt(4), P);
  if ((y * y) % P !== ySquared) {
    throw new MalformedDidKeyError(did, "x is not on the curve");
  }
  if ((y % BigInt(2) === BigInt(0)) !== (prefix === 0x02)) {
    y = P - y;
  }

  const uncompressed = new Uint8Array(65);
  uncompressed[0] = 0x04;
  uncompressed.set(bigIntToBytes(x), 1);
  uncompressed.set(bigIntToBytes(y), 33);
  return uncompressed;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = BigInt(1);
  let b = base % mod;
  let e = exp;
  while (e > BigInt(0)) {
    if (e & BigInt(1)) {
      result = (result * b) % mod;
    }
    e >>= BigInt(1);
    b = (b * b) % mod;
  }
  return result;
}

function bigIntToBytes(value: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let v = value;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(v & BigInt(0xff));
    v >>= BigInt(8);
  }
  return bytes;
}
