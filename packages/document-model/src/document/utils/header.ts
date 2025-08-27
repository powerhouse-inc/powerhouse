import type { PHDocumentHeader } from "document-model";
import { generateUUIDBrowser } from "document-model";

/**
 * Parameters used in a document signature.
 */
export type SigningParameters = {
  documentType: string;
  createdAtUtcIso: string;

  /**
   * The nonce can act as both a salt and a typical nonce.
   */
  nonce: string;
};

/**
 * Describes a signer. This may only have a public key for verification.
 */
export interface ISigner {
  /** The corresponding public key */
  publicKey(): Promise<JsonWebKey>;

  /**
   * Signs data.
   *
   * @param data - The data to sign.
   *
   * @returns The signature of the data.
   */
  sign: (data: Uint8Array) => Promise<Uint8Array>;

  /**
   * Verifies a signature.
   *
   * @param data - The data to verify.
   * @param signature - The signature to verify.
   */
  verify: (data: Uint8Array, signature: Uint8Array) => Promise<void>;
}

/**
 * Generates a deterministic payload from signing parameters
 */
const generateStablePayload = (parameters: SigningParameters): string =>
  `${parameters.documentType}:${parameters.createdAtUtcIso}:${parameters.nonce}`;

/**
 * A signer that uses a public key to verify data.
 */
export class PublicKeySigner implements ISigner {
  readonly #publicKey: JsonWebKey;

  protected readonly subtleCrypto: Promise<SubtleCrypto>;
  protected publicCryptoKey: CryptoKey | undefined;

  constructor(publicKey: JsonWebKey) {
    this.#publicKey = publicKey;
    this.subtleCrypto = this.#initCrypto();
  }

  #initCrypto() {
    return new Promise<SubtleCrypto>((resolve, reject) => {
      if (typeof window === "undefined") {
        import("node:crypto")
          .then((module) => {
            resolve(module.webcrypto.subtle as SubtleCrypto);
          })
          .catch(reject);
      } else {
        if (!window.crypto?.subtle) {
          reject(new Error("Crypto module not available"));
        }
        resolve(window.crypto.subtle);
      }
    });
  }

  async publicKey(): Promise<JsonWebKey> {
    return this.#publicKey;
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    throw new Error("PublicKeySigner only supports verification");
  }

  async verify(data: Uint8Array, signature: Uint8Array): Promise<void> {
    const subtleCrypto = await this.subtleCrypto;
    if (!this.publicCryptoKey) {
      this.publicCryptoKey = await subtleCrypto.importKey(
        "jwk",
        this.#publicKey,
        {
          name: "Ed25519",
          namedCurve: "Ed25519",
        },
        true,
        ["verify"],
      );
    }

    let isValid;
    try {
      isValid = await subtleCrypto.verify(
        "Ed25519",
        this.publicCryptoKey,
        new Uint8Array(signature),
        new Uint8Array(data),
      );
    } catch (error) {
      throw new Error("invalid signature");
    }

    if (!isValid) {
      throw new Error("invalid signature");
    }
  }
}

/**
 * Creates a signer from a header.
 *
 * @param header - The header to create a signer from.
 *
 * @returns A signer for the header.
 */
const createSignerFromHeader = async (
  header: PHDocumentHeader,
): Promise<ISigner> => {
  return new PublicKeySigner(header.sig.publicKey);
};

/**
 * Signs a header. Generally, this is not called directly, but rather through
 * {@link createSignedHeader}.
 *
 * @param parameters - The parameters used to sign the header.
 * @param signer - The signer of the document.
 *
 * @returns The signature of the header.
 */
export const sign = async (
  parameters: SigningParameters,
  signer: ISigner,
): Promise<string> => {
  // Generate stable payload
  const payload = generateStablePayload(parameters);

  // Convert payload to Uint8Array for signing
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);

  // Create signature using Web Crypto API with Ed25519
  const signature = await signer.sign(data);

  // Convert signature to base64 string for JSON serialization
  const signatureArray = new Uint8Array(signature);
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
  return signatureBase64;
};

/**
 * Verifies a header signature. Generally, this is not called directly, but
 * rather through {@link validateHeader}.
 *
 * @param parameters - The parameters used to sign the header.
 * @param signature - The signature to verify.
 * @param signer - The signer of the document.
 */
export const verify = async (
  parameters: SigningParameters,
  signature: string,
  signer: ISigner,
): Promise<void> => {
  // Generate the same stable payload that was signed
  const payload = generateStablePayload(parameters);

  // Convert payload to Uint8Array for verification
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);

  // Decode the base64 signature back to binary
  const signatureBytes = Uint8Array.from(atob(signature), (c) =>
    c.charCodeAt(0),
  );

  await signer.verify(data, signatureBytes);
};

/**
 * Validates a header signature.
 */
export const validateHeader = async (
  header: PHDocumentHeader,
): Promise<void> => {
  const signer = await createSignerFromHeader(header);

  return await verify(
    {
      documentType: header.documentType,
      createdAtUtcIso: header.createdAtUtcIso,
      nonce: header.sig.nonce,
    },
    header.id,
    signer,
  );
};

/**
 * Creates a header that has yet to be signed. This header is not valid, but
 * can be input into {@link createSignedHeader} to create a signed header.
 *
 * @returns An unsigned header for a document.
 */
export const createPresignedHeader = (
  id: string = generateUUIDBrowser(),
  documentType = "",
): PHDocumentHeader => {
  return {
    id,
    sig: {
      publicKey: {},
      nonce: "",
    },
    documentType,
    createdAtUtcIso: new Date().toISOString(),
    slug: "",
    name: "",
    branch: "main",
    revision: {
      document: 0,
    },
    lastModifiedAtUtcIso: new Date().toISOString(),
    meta: {},
  };
};

/**
 * Creates a new, signed header for a document. This will replace the id of the
 * document.
 *
 * @param unsignedHeader - The unsigned header to created the signed header from.
 * @param signer - The signer of the document.
 *
 * @returns A new signed header for a document. Some fields are mutable and
 * some are not. See the PHDocumentHeader type for more information.
 */
export const createSignedHeader = async (
  unsignedHeader: PHDocumentHeader,
  documentType: string,
  signer: ISigner,
): Promise<PHDocumentHeader> => {
  const parameters: SigningParameters = {
    documentType,
    createdAtUtcIso: unsignedHeader.createdAtUtcIso,
    nonce: generateUUIDBrowser(),
  };

  const signature = await sign(parameters, signer);
  const publicKey = await signer.publicKey();

  return {
    // immutable fields
    id: signature,
    sig: {
      publicKey,
      nonce: parameters.nonce,
    },
    documentType,
    createdAtUtcIso: unsignedHeader.createdAtUtcIso,

    // mutable fields
    slug: "",
    name: "",
    branch: "",
    revision: {
      document: 0,
    },
    lastModifiedAtUtcIso: unsignedHeader.lastModifiedAtUtcIso,
    meta: {},
  };
};

/**
 * Creates a signed header for a document. The document header requires a signer
 * as the document id is a Ed25519 signature.
 *
 * @param documentType - The type of the document.
 * @param signer - The signer of the document.
 *
 * @returns The signed header for a document. Some fields are mutable and
 * some are not. See the PHDocumentHeader type for more information.
 */
export const createSignedHeaderForSigner = async (
  documentType: string,
  signer: ISigner,
): Promise<PHDocumentHeader> => {
  const unsignedHeader = createPresignedHeader();
  const signedHeader = await createSignedHeader(
    unsignedHeader,
    documentType,
    signer,
  );

  return signedHeader;
};
