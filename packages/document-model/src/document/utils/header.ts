import { PHDocumentHeader } from "#document/ph-types.js";
import { generateUUID } from "#utils/env";

export class InvalidSignatureError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "InvalidSignatureError";
  }
}

export type SigningParameters = {
  documentType: string;
  createdAtUtcIso: string;
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
  const payload = `${parameters.documentType}:${parameters.createdAtUtcIso}:${parameters.nonce}`;

  return payload;
};

const createSignerFromHeader = async (
  header: PHDocumentHeader,
): Promise<Signer> => {
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    header.sig.publicKey,
    {
      name: "Ed25519",
      namedCurve: "Ed25519",
    },
    true,
    ["verify"],
  );

  return {
    publicKey,
  };
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

  // Verify signature using Web Crypto API with Ed25519
  let isValid;
  try {
    isValid = await crypto.subtle.verify(
      "Ed25519",
      signer.publicKey,
      signatureBytes,
      data,
    );
  } catch (error) {
    throw new InvalidSignatureError("Invalid signature");
  }

  if (!isValid) {
    throw new InvalidSignatureError("Invalid signature");
  }
};

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
 * Creates an unsigned header for a document. This header is not valid, but
 * can be input into {@link createSignedHeader} to create a signed header.
 *
 * @returns An unsigned header for a document.
 */
export const createPresignedHeader = (): PHDocumentHeader => {
  return {
    id: "",
    sig: {
      publicKey: {},
      nonce: "",
    },
    documentType: "",
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
 * Creates a new, signed header for a document.
 *
 * @param presignedHeader - The presigned header to created the signed header from.
 * @param signer - The signer of the document.
 *
 * @returns A new signed header for a document. Some fields are mutable and
 * some are not. See the PHDocumentHeader type for more information.
 */
export const createSignedHeader = async (
  presignedHeader: PHDocumentHeader,
  documentType: string,
  signer: Signer,
): Promise<PHDocumentHeader> => {
  const parameters: SigningParameters = {
    documentType,
    createdAtUtcIso: presignedHeader.createdAtUtcIso,
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
    createdAtUtcIso: presignedHeader.createdAtUtcIso,

    // mutable fields
    slug: "",
    name: "",
    branch: "",
    revision: {
      document: 0,
    },
    lastModifiedAtUtcIso: presignedHeader.lastModifiedAtUtcIso,
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
  signer: Signer,
): Promise<PHDocumentHeader> => {
  const presignedHeader = createPresignedHeader();
  const signedHeader = await createSignedHeader(
    presignedHeader,
    documentType,
    signer,
  );

  return signedHeader;
};
