import {
  type Action,
  type AppActionSigner,
  type ISigner,
  type Operation,
  type Signature,
  type UserActionSigner,
} from "document-model";
import type { IRenownCrypto } from "./index.js";
import {
  createSignatureVerifier,
  getActionSignature,
  signAction,
  signActions,
} from "./utils.js";

export class InvalidSignatureError extends Error {
  constructor() {
    super("Invalid signature");
  }
}

export class EmptySignatureError extends Error {
  constructor() {
    super("No signature found");
  }
}

export class RenownCryptoSigner implements ISigner {
  readonly app: AppActionSigner;

  constructor(
    private readonly crypto: IRenownCrypto,
    private readonly appName: string,
    readonly user?: UserActionSigner,
  ) {
    this.app = {
      key: this.crypto.did,
      name: this.appName,
    };
  }

  static signatureVerifier = createSignatureVerifier();
  static signAction = signAction;
  static signActions = signActions;

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

  async verifyAction(action: Action): Promise<void> {
    const existingSignature = getActionSignature(action);
    if (!existingSignature) {
      throw new EmptySignatureError();
    }
    const publicKey = existingSignature[1];

    const tempOperation: Operation = {
      id: "",
      index: 0,
      timestampUtcMs: action.timestampUtcMs || new Date().toISOString(),
      hash: "",
      skip: 0,
      action: action,
    };
    const isValid = await RenownCryptoSigner.signatureVerifier(
      tempOperation,
      publicKey,
    );
    if (!isValid) {
      throw new InvalidSignatureError();
    }
  }

  async signAction(
    action: Action,
    abortSignal?: AbortSignal,
    overrideSignature: boolean = false,
  ): Promise<Signature> {
    if (abortSignal?.aborted) {
      throw new Error("Signing aborted");
    }

    // If the action already has a signature and overrideSignature is false,
    // verify the signature and return it if it is valid
    const existingSignature = getActionSignature(action);
    if (existingSignature && !overrideSignature) {
      await this.verifyAction(action);
      if (abortSignal?.aborted) {
        throw new Error("Signing aborted");
      }
      return existingSignature;
    }

    const timestamp = (new Date().getTime() / 1000).toFixed(0);

    const hash = await this.hashAction(action);

    if (abortSignal?.aborted) {
      throw new Error("Signing aborted");
    }

    const prevStateHash = action.context?.prevOpHash ?? "";

    const params: [string, string, string, string] = [
      timestamp,
      this.crypto.did,
      hash,
      prevStateHash,
    ];
    const message = this.buildSignatureMessage(params);
    const signatureBytes = await this.crypto.sign(message);
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
