import {
  signActionV2,
  type Action,
  type ActionSigningTarget,
  type AppActionSigner,
  type ISigner,
  type Signature,
  type UserActionSigner,
} from "@powerhousedao/shared/document-model";

/**
 * Attribution for an unauthenticated monitor reactor. The zero address says
 * "nobody in particular" rather than impersonating a wallet; pass
 * {@link LocalSignerOptions.user} to attribute writes to a real identity.
 */
export const ANONYMOUS_MONITOR_USER: UserActionSigner = {
  address: "0x0000000000000000000000000000000000000000",
  networkId: "eip155",
  chainId: 1,
};

export const MONITOR_APP_NAME = "reactor-monitor";

export type LocalSignerOptions = {
  /** Who writes are attributed to. Defaults to {@link ANONYMOUS_MONITOR_USER}. */
  user?: UserActionSigner;
  /** The `app.name` half of the signer identity. */
  appName?: string;
};

/**
 * The monitor's signer: a fresh in-memory P-256 key, no Renown.
 *
 * This is the smallest signer the stack actually works with, and the reason
 * it is a real key rather than a no-op stub is worth stating: new documents
 * are created `v2-required` by default, and `v2-required` refuses an unsigned
 * write (`UNSIGNED_REQUIRED`) regardless of `authEnforcement`. A
 * signs-nothing signer therefore cannot create a document at all. Signing
 * with a local key keeps the default policy intact while staying free of key
 * storage, wallets and credential services.
 *
 * What it deliberately does not do:
 * - persist the key: it is regenerated per boot, so signatures from an
 *   earlier session verify against the tuple they carry, not against this
 *   key;
 * - prove anything about the signing identity. There is no credential
 *   binding this key to `user`, so `featureFlags.authEnforcement` must stay
 *   off (under it a signed write with no trust policy is refused);
 * - verify: `verify()` resolves, which is what the reactor's own signature
 *   verification path expects of a host signer (it verifies tuples itself,
 *   against the key in the tuple).
 */
export class LocalSigner implements ISigner {
  readonly user: UserActionSigner;
  readonly app: AppActionSigner;
  readonly publicKey: CryptoKey;
  private readonly privateKey: CryptoKey;

  private constructor(
    keyPair: CryptoKeyPair,
    did: string,
    user: UserActionSigner,
    appName: string,
  ) {
    this.publicKey = keyPair.publicKey;
    this.privateKey = keyPair.privateKey;
    this.user = user;
    this.app = { name: appName, key: did };
  }

  /** The `did:key` this signer's tuples name as the signing key. */
  get did(): string {
    return this.app.key;
  }

  static async create(options: LocalSignerOptions = {}): Promise<LocalSigner> {
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    return new LocalSigner(
      keyPair,
      await didKeyFor(keyPair.publicKey),
      options.user ?? ANONYMOUS_MONITOR_USER,
      options.appName ?? MONITOR_APP_NAME,
    );
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      this.privateKey,
      data.buffer as ArrayBuffer,
    );
    return new Uint8Array(signature);
  }

  verify(): Promise<void> {
    return Promise.resolve();
  }

  signAction(action: Action, target: ActionSigningTarget): Promise<Signature> {
    return signActionV2({
      action,
      target,
      signer: { user: this.user, app: this.app },
      sign: (data) => this.sign(data),
    });
  }
}

/** Convenience over {@link LocalSigner.create}. */
export function createLocalSigner(
  options?: LocalSignerOptions,
): Promise<ISigner> {
  return LocalSigner.create(options);
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const P256_MULTICODEC = [0x80, 0x24] as const;

/**
 * `did:key:z<base58btc(multicodec || compressed point)>` for a P-256 key —
 * the form `packages/reactor`'s `importDidKey` decodes. Encoding lives here
 * because `@powerhousedao/shared/document-model` exports `base58Decode` but
 * not `base58Encode`.
 */
async function didKeyFor(publicKey: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
  const compressed = new Uint8Array(35);
  compressed[0] = P256_MULTICODEC[0];
  compressed[1] = P256_MULTICODEC[1];
  // Compressed SEC1: the prefix records the parity of y, then the 32-byte x.
  compressed[2] = (raw[64]! & 1) === 1 ? 0x03 : 0x02;
  compressed.set(raw.subarray(1, 33), 3);
  return `did:key:z${base58Encode(compressed)}`;
}

function base58Encode(bytes: Uint8Array): string {
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i]! << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = "";
  for (let k = 0; k < bytes.length && bytes[k] === 0; k++) {
    out += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    out += BASE58[digits[i]!];
  }
  return out;
}
