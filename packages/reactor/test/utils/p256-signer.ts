import type {
  Action,
  ActionSigner,
  ISigner,
  Signature,
} from "@powerhousedao/shared/document-model";
import {
  buildOperationSignature,
  buildOperationSignatureMessage,
  signActionV2,
  type ActionSigningTarget,
} from "@powerhousedao/shared/document-model";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Emits the tuples renown and shared signers produce, over a real P-256 key. */
export class TestP256Signer {
  private constructor(
    private readonly keyPair: CryptoKeyPair,
    readonly did: string,
  ) {}

  static async create(): Promise<TestP256Signer> {
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const raw = new Uint8Array(
      await crypto.subtle.exportKey("raw", keyPair.publicKey),
    );
    const compressed = new Uint8Array(35);
    compressed[0] = 0x80;
    compressed[1] = 0x24;
    compressed[2] = (raw[64] & 1) === 1 ? 0x03 : 0x02;
    compressed.set(raw.subarray(1, 33), 3);
    return new TestP256Signer(keyPair, `did:key:z${base58Encode(compressed)}`);
  }

  get user(): ActionSigner["user"] {
    return { address: "0xabc", networkId: "eip155", chainId: 1 };
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      this.keyPair.privateKey,
      data.buffer as ArrayBuffer,
    );
    return new Uint8Array(signature);
  }

  /** The v2 tuple every current signer emits. */
  async v2Tuple(
    action: Action,
    target: ActionSigningTarget,
    user: ActionSigner["user"] = this.user,
    previousStateHash = "",
  ): Promise<Signature> {
    return signActionV2({
      action,
      target,
      signer: { user, app: { name: "test", key: this.did } },
      sign: (message) => this.sign(message),
      previousStateHash,
    });
  }

  /** Mirrors the legacy RenownCryptoSigner hash. */
  async renownTuple(action: Action, prevStateHash = ""): Promise<Signature> {
    const payload = [
      action.scope,
      action.type,
      JSON.stringify(action.input),
    ].join("");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(payload),
    );
    return this.tupleOver(bytesToBase64(new Uint8Array(digest)), prevStateHash);
  }

  /** The shared buildOperationSignature path reactor-browser signs with. */
  async sharedTuple(action: Action, documentId: string): Promise<Signature> {
    return buildOperationSignature(
      {
        documentId,
        signer: this.actionSigner([]),
        action,
        previousStateHash: "",
      },
      (message) => this.sign(message),
    );
  }

  /** ECDSA over tuple[0..3] with an arbitrary hash in element [2]. */
  async tupleOver(hash: string, prevStateHash = ""): Promise<Signature> {
    const params: [string, string, string, string] = [
      (Date.now() / 1000).toFixed(0),
      this.did,
      hash,
      prevStateHash,
    ];
    const signature = await this.sign(buildOperationSignatureMessage(params));
    return [...params, `0x${bytesToHex(signature)}`];
  }

  /** An ISigner over this key, recording every target it signs for. */
  asISigner(targets: ActionSigningTarget[] = []): ISigner {
    return {
      user: this.user,
      app: { name: "test", key: this.did },
      publicKey: this.keyPair.publicKey,
      sign: (data) => this.sign(data),
      verify: () => Promise.resolve(),
      signAction: (action, target) => {
        targets.push(target);
        return this.v2Tuple(action, target);
      },
    };
  }

  actionSigner(signatures: Signature[]): ActionSigner {
    return {
      user: this.user,
      app: { name: "test", key: this.did },
      signatures,
    };
  }

  signed(action: Action, signature: Signature): Action {
    return {
      ...action,
      context: { ...action.context, signer: this.actionSigner([signature]) },
    };
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base58Encode(bytes: Uint8Array): string {
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
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
    out += BASE58[digits[i]];
  }
  return out;
}
