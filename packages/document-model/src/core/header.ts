import type { Action, PHDocumentHeader, Signature } from "./ph-types.js";
import type { ISigner, SigningParameters } from "./types.js";
import { generateId } from "./utils.js";

/**
 * Generates a deterministic payload from signing parameters
 */
const generateStablePayload = (parameters: SigningParameters): string =>
  `${parameters.documentType}:${parameters.createdAtUtcIso}:${parameters.nonce}`;

/**
 * Creates a verification-only signer from a public key.
 * This signer can only verify signatures, not sign data.
 *
 * @param pubKey - The public key to use for verification.
 * @returns An ISigner that can only verify signatures.
 */
export async function createVerificationSigner(
  pubKey: JsonWebKey,
): Promise<ISigner> {
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    pubKey,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  return {
    publicKey: cryptoKey,

    async sign(_data: Uint8Array): Promise<Uint8Array> {
      throw new Error("verification-only signer cannot sign data");
    },

    async signAction(
      _action: Action,
      _abortSignal?: AbortSignal,
    ): Promise<Signature> {
      throw new Error("verification-only signer cannot sign actions");
    },

    async verify(data: Uint8Array, signature: Uint8Array): Promise<void> {
      let isValid: boolean;
      try {
        isValid = await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" },
          cryptoKey,
          new Uint8Array(signature),
          new Uint8Array(data),
        );
      } catch {
        throw new Error("invalid signature");
      }

      if (!isValid) {
        throw new Error("invalid signature");
      }
    },

    async verifyAction(action: Action): Promise<void> {
      throw new Error("verification-only signer cannot verify actions");
    },
  };
}

/**
 * Creates a verification-only signer from a header.
 *
 * @param header - The header to create a signer from.
 * @returns A signer that can verify the header's signature.
 */
const createSignerFromHeader = async (
  header: PHDocumentHeader,
): Promise<ISigner> => {
  return createVerificationSigner(header.sig.publicKey);
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

  return verify(
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
  id: string = generateId(),
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
    nonce: generateId(),
  };

  const signature = await sign(parameters, signer);

  const jsonPublicKey = await crypto.subtle.exportKey("jwk", signer.publicKey);

  return {
    // immutable fields
    id: signature,
    sig: {
      publicKey: jsonPublicKey,
      nonce: parameters.nonce,
    },
    documentType,
    createdAtUtcIso: unsignedHeader.createdAtUtcIso,

    // mutable fields
    slug: unsignedHeader.slug,
    name: unsignedHeader.name,
    branch: unsignedHeader.branch,
    revision: unsignedHeader.revision,
    lastModifiedAtUtcIso: unsignedHeader.lastModifiedAtUtcIso,
    meta: unsignedHeader.meta,
  };
};

/**
 * Creates a signed header for a document. The document header requires a signer
 * as the document id is a cryptographic signature.
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
