import type {
  ActionSigner,
  ISigner,
  SignatureVerificationHandler,
} from "@powerhousedao/shared/document-model";
import type { FactorySpec } from "../executor/worker/protocol.js";

export type { SignatureVerificationHandler };

/** The signer a client signs with and the executor signs synthesized operations with. */
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

  /** Decides which keys may sign as which users; see {@link SignatureTrustPolicy}. */
  trustPolicy?: SignatureTrustPolicy;

  /**
   * What a pooled executor worker imports to build the same trust policy.
   * Omitted = pooled workers apply the default.
   */
  workerTrustPolicy?: FactorySpec;
};

/**
 * The host's answer to whether `key` may sign as `signer.user`. The reactor has
 * already proven that `key` made the signature over this action in this
 * document.
 *
 * Asked once per signed write at admission, never on a re-append, and never for
 * an unsigned action. `false` refuses the write as `SIGNER_UNAUTHORIZED`. A
 * throw is a job error: the job is retried and nothing is dropped, so a
 * transient failure must throw rather than answer `false`.
 *
 * The answer may not depend on when it is asked: replicas admit the same write
 * at different times and must reach the same verdict. Cache an acceptance and
 * never expire it.
 *
 * The reactor's own key signing as its own user is accepted before the policy
 * is asked. Without a policy, a signed write is refused under `authEnforcement`
 * and accepted otherwise.
 */
export type SignatureTrustPolicy = {
  authorizeSigner(
    signer: ActionSigner,
    key: string,
    documentId: string,
  ): Promise<boolean>;
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
