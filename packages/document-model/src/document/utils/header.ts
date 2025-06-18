import { PHDocumentHeader } from "#document/ph-types.js";
import { generateUUID } from "#utils/env";

export type SigningParameters = {
  documentType: string;
  createdAtUtcMs: number;
  nonce: string;
};

export interface Signer {
  /** The private key used for signing */
  privateKey?: CryptoKey;

  /** The corresponding public key */
  publicKey: CryptoKey;
}

/**
 * Generates a deterministic payload from signing parameters
 */
const generateStablePayload = (parameters: SigningParameters): string => {
  // Create a deterministic string representation using string interpolation
  // This ensures stability across different JavaScript environments
  const payload = `${parameters.documentType}:${parameters.createdAtUtcMs}:${parameters.nonce}`;

  return payload;
};

export const sign = async (
  parameters: SigningParameters,
  signer: Signer,
): Promise<string> => {
  if (!signer.privateKey) {
    throw new Error("Signer private key is required");
  }

  // Generate stable payload
  const payload = generateStablePayload(parameters);

  // Convert payload to Uint8Array for signing
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);

  // Create signature using Web Crypto API with Ed25519
  const signature = await crypto.subtle.sign(
    "Ed25519",
    signer.privateKey,
    data,
  );

  // Convert signature to base64 string for JSON serialization
  const signatureArray = new Uint8Array(signature);
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray));

  return signatureBase64;
};

export const verify = async (
  parameters: SigningParameters,
  signature: string,
  signer: Signer,
): Promise<boolean> => {
  try {
    // Generate the same stable payload that was signed
    const payload = generateStablePayload(parameters);

    // Convert payload to Uint8Array for verification
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);

    // Decode the base64 signature back to binary
    const signatureBytes = Uint8Array.from(atob(signature), (c) =>
      c.charCodeAt(0),
    );

    // Verify signature using Web Crypto API with Ed25519
    const isValid = await crypto.subtle.verify(
      "Ed25519",
      signer.publicKey,
      signatureBytes,
      data,
    );

    return isValid;
  } catch (error) {
    // If any step fails (invalid base64, crypto error, etc.), signature is invalid
    return false;
  }
};

/**
 * Creates an empty header for a document. This header is not valid, but can
 * be used for type checking.
 *
 * @returns An empty header for a document.
 */
export const createEmptyHeader = (): PHDocumentHeader => {
  return {
    id: "",
    sig: {
      publicKey: {},
      nonce: "",
    },
    documentType: "",
    createdAtUtcMs: 0,
    slug: "",
    name: "",
    branch: "",
    lastModifiedAtUtcMs: 0,
    meta: {},
  };
};

/**
 * Creates a header for a document. The document header requires a signer as
 * the document id is a Ed25519 signature.
 *
 * @param documentType - The type of the document.
 * @param signer - The signer of the document.
 *
 * @returns The default header for a document. Some fields are mutable and
 * some are not. See the PHDocumentHeader type for more information.
 */
export const createHeaderForSigner = async (
  documentType: string,
  signer: Signer,
): Promise<PHDocumentHeader> => {
  const parameters: SigningParameters = {
    documentType,
    createdAtUtcMs: Date.now(),
    nonce: generateUUID(),
  };

  const signature = await sign(parameters, signer);

  // use jwk: it is already json and it is self describing. This will allow us
  // to, for instance, change curves in the future without breaking backwards
  // compatibility.
  const publicKey = await crypto.subtle.exportKey("jwk", signer.publicKey);

  return {
    // immutable fields
    id: signature,
    sig: {
      publicKey,
      nonce: parameters.nonce,
    },
    documentType,
    createdAtUtcMs: parameters.createdAtUtcMs,

    // mutable fields
    slug: "",
    name: "",
    branch: "",
    lastModifiedAtUtcMs: parameters.createdAtUtcMs,
    meta: {},
  };
};
