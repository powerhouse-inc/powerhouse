import type {
  Action,
  ActionSigningContext,
  AppActionSigner,
  ISigner,
  Operation,
  Signature,
  SignatureVerificationContext,
  SignatureVerificationHandler,
  UserActionSigner,
} from "@powerhousedao/shared/document-model";
import {
  buildSignatureMessageV2,
  expectedActionHashes,
  hashActionV2,
  parseSignatureHashField,
  SIGNATURE_SCHEME_LEGACY,
  SIGNATURE_SCHEME_V2,
  signatureScheme,
} from "@powerhousedao/shared/document-model";

// The signature hash-field parser lives in shared so both the signer and the
// reactor-side verifier read element [3] the same way.
export {
  extractResultingHashFromSignature,
  parseSignatureHashField,
  signatureHasResultingHash,
} from "@powerhousedao/shared/document-model";
import type { IRenownCrypto } from "./index.js";

export class InvalidSignatureError extends Error {
  constructor() {
    super("Invalid signature");
  }
}

export class RenownCryptoSigner implements ISigner {
  readonly app: AppActionSigner;

  constructor(
    private readonly crypto: IRenownCrypto,
    private readonly appName: string,
    public user?: UserActionSigner,
  ) {
    this.app = {
      key: this.crypto.did,
      name: this.appName,
    };
  }

  get publicKey() {
    return this.crypto.publicKey;
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    return this.crypto.sign(data);
  }

  async verify(data: Uint8Array, signature: Uint8Array): Promise<void> {
    const isValid = await this.crypto.verify(data, signature);
    if (!isValid) {
      throw new InvalidSignatureError();
    }
  }

  async signAction(
    action: Action,
    context: ActionSigningContext,
    abortSignal?: AbortSignal,
  ): Promise<Signature> {
    const hashField = action.context?.prevOpHash ?? "";
    return this._signAction(action, hashField, context, abortSignal);
  }

  /**
   * Signs an action including a predicted resulting state hash.
   *
   * The resulting hash is packed into the signature tuple's 4th element (index 3)
   * using the format: `${prevStateHash}:${resultingStateHash}`
   *
   * This allows offline verification of documents without reducer logic:
   * - Verifier can check that the signature is valid for the claimed resulting state
   * - Verifier can compare claimed resulting state to actual operation.hash
   *
   * @param action - The action to sign
   * @param resultingStateHash - The predicted hash of document state AFTER this action runs
   * @param abortSignal - Optional abort signal
   * @returns A Signature tuple with the resulting hash encoded in element [3]
   */
  async signActionWithResultingState(
    action: Action,
    resultingStateHash: string,
    context: ActionSigningContext,
    abortSignal?: AbortSignal,
  ): Promise<Signature> {
    const prevStateHash = action.context?.prevOpHash ?? "";
    const hashField = `${prevStateHash}:${resultingStateHash}`;
    return this._signAction(action, hashField, context, abortSignal);
  }

  /**
   * Internal signing implementation shared by signAction and signActionWithResultingState.
   */
  private async _signAction(
    action: Action,
    hashField: string,
    context: ActionSigningContext,
    abortSignal?: AbortSignal,
  ): Promise<Signature> {
    if (abortSignal?.aborted) {
      throw new Error("Signing aborted");
    }

    const timestamp = (new Date().getTime() / 1000).toFixed(0);
    const hash = await hashActionV2(context.documentId, action);

    if (abortSignal?.aborted) {
      throw new Error("Signing aborted");
    }

    // The scheme is signed as well as carried, so it cannot be relabelled to
    // steer the verifier at a weaker preimage (#2894).
    const signed: [string, string, string, string, string] = [
      timestamp,
      this.crypto.did,
      hash,
      hashField,
      SIGNATURE_SCHEME_V2,
    ];
    const message = buildSignatureMessageV2(signed);
    const signatureBytes = await this.crypto.sign(message);
    const signatureHex = `0x${this.arrayBufferToHex(signatureBytes)}`;

    if (abortSignal?.aborted) {
      throw new Error("Signing aborted");
    }

    return [
      timestamp,
      this.crypto.did,
      hash,
      hashField,
      signatureHex,
      SIGNATURE_SCHEME_V2,
    ];
  }

  private arrayBufferToHex(buffer: Uint8Array | ArrayBuffer): string {
    const bytes =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
}

export type SignatureVerifierOptions = {
  /**
   * Accept signatures written before the scheme field existed. Those schemes
   * include a document-agnostic preimage, so a legacy signature can still be
   * replayed onto another document; the flag exists so a deployment with no
   * legacy signatures left in storage can refuse them (#2894).
   */
  allowLegacySignatures?: boolean;

  /**
   * Refuse a signature that declares no previous state hash, and refuse to
   * verify at all when the caller cannot say which state the action applies to.
   * Off by default, which leaves the check self-gating (#2894).
   */
  requirePreviousState?: boolean;
};

/**
 * Creates a signature verification handler that verifies signatures using the Web Crypto API.
 * The verification uses ECDSA with P-256 curve and SHA-256 hash, matching the RenownCrypto signing algorithm.
 */
export function createSignatureVerifier(
  requireSignature = false,
  {
    allowLegacySignatures = true,
    requirePreviousState = false,
  }: SignatureVerifierOptions = {},
): SignatureVerificationHandler {
  return async (
    operation: Operation,
    publicKey: string,
    context: SignatureVerificationContext,
  ): Promise<boolean> => {
    // A runtime payload can be missing its action even though the type says
    // otherwise. Such an operation carries no signer, so it is treated as
    // unsigned rather than throwing (#2894).
    const action: Action | undefined = operation.action;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `action` is required by the type but can be absent at runtime
    if (!action?.context?.signer || !publicKey) {
      return !requireSignature;
    }
    const signer = action.context.signer;
    const signatures = signer.signatures;
    if (signatures.length === 0) {
      return false;
    }

    const signature = signatures[signatures.length - 1];
    const [timestamp, signerKey, hash, prevStateHash, signatureHex] = signature;

    if (signerKey !== publicKey) {
      return false;
    }

    const scheme = signatureScheme(signature);
    if (scheme === SIGNATURE_SCHEME_LEGACY && !allowLegacySignatures) {
      return false;
    }

    // Bind the signature to the action: recompute the action hash from the
    // action being verified and refuse it if the hash the signature claims
    // matches none of the preimages the action actually carries. A signature
    // must describe the action, and the document it is attached to, not merely
    // be a valid signature over itself (#2894).
    //
    // The scheme is read from the tuple before the signature is verified,
    // which is safe because each scheme's hash commits to its own name: a
    // relabelled signature matches no hash the relabelled scheme computes.
    const expected = await expectedActionHashes(
      scheme,
      context.documentId,
      action,
    );
    if (!expected.includes(hash)) {
      return false;
    }

    // Bind the signature to the state it was made at. Element [3] is inside
    // the signed message, so a mismatch means the signature was made against a
    // different state and an attacker cannot blank it to skip this (#2894).
    const declaredPrevState =
      parseSignatureHashField(prevStateHash).prevStateHash;
    const expectedPrevState = context.previousStateHash;
    if (requirePreviousState && declaredPrevState === "") {
      return false;
    }
    if (requirePreviousState && expectedPrevState === undefined) {
      return false;
    }
    if (
      declaredPrevState !== "" &&
      expectedPrevState !== undefined &&
      declaredPrevState !== expectedPrevState
    ) {
      return false;
    }

    const message =
      scheme === SIGNATURE_SCHEME_V2
        ? buildSignatureMessageV2([
            timestamp,
            signerKey,
            hash,
            prevStateHash,
            scheme,
          ])
        : buildSignatureMessage([timestamp, signerKey, hash, prevStateHash]);
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
