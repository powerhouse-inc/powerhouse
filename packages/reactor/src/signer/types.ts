import type {
  ISigner,
  SignatureVerificationHandler,
} from "@powerhousedao/shared/document-model";
import type { FactorySpec } from "../executor/worker/protocol.js";

export type { SignatureVerificationHandler };

/**
 * Configuration for signing and verification.
 */
export type SignerConfig = {
  /**
   * The signer used to sign actions before submission.
   */
  signer: ISigner;

  /**
   * What a pooled executor worker imports to build the same signer, which
   * cannot cross the thread boundary itself. Omitted = pooled workers store
   * synthesized operations unsigned.
   */
  workerSigner?: FactorySpec;

  /** @deprecated Ignored: the executor verifies signature integrity itself. */
  verifier?: SignatureVerificationHandler;
};

/** `log` counts refusals and admits anyway; `enforce` refuses. */
export type SignatureVerificationMode = "log" | "enforce";

export const SIGNATURE_REFUSAL_CODES = [
  "UNSIGNED_REQUIRED",
  "KEY_MISMATCH",
  "MALFORMED_TUPLE",
  "TIMESTAMP_MISMATCH",
  "HASH_MISMATCH",
  "BAD_SIGNATURE",
  "SCHEME_BELOW_POLICY",
  "ID_MISMATCH",
  "ACTION_NOT_ALLOWED",
  "DUPLICATE_ACTION",
  "SIGNER_UNAUTHORIZED",
] as const;

export type SignatureRefusalCode = (typeof SIGNATURE_REFUSAL_CODES)[number];

/** Read from the prefix or length of tuple[2]. */
export type SignatureScheme =
  | "unsigned"
  | "v2"
  | "legacy-renown"
  | "legacy-shared"
  | "legacy-unknown";

/** Where this reactor first stores the write. */
export type AdmissionPath = "mutation" | "load";

export type SignatureVerdict =
  | { ok: true; scheme: SignatureScheme }
  | {
      ok: false;
      scheme: SignatureScheme;
      code: SignatureRefusalCode;
      reason: string;
    };
