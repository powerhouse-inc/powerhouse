import {
  DEFAULT_SIGNATURE_POLICY,
  isSignaturePolicy,
  type SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";

/**
 * What new documents are created as, from CREATE_SIGNATURE_POLICY. Without a
 * signer this switchboard cannot write to a v2-required document, so it falls
 * back to legacy and says so.
 */
export function resolveCreateSignaturePolicy(
  env: NodeJS.ProcessEnv,
  options: { hasSigner: boolean; logger?: Pick<ILogger, "warn"> },
): SignaturePolicy {
  const raw = env.CREATE_SIGNATURE_POLICY?.trim();
  let policy: SignaturePolicy = DEFAULT_SIGNATURE_POLICY;
  if (raw) {
    if (!isSignaturePolicy(raw)) {
      throw new Error(
        `CREATE_SIGNATURE_POLICY must be "legacy" or "v2-required", got "${raw}"`,
      );
    }
    policy = raw;
  }

  if (policy === "v2-required" && !options.hasSigner) {
    options.logger?.warn(
      "No signer is configured, so new documents are created legacy: a v2-required document refuses the unsigned operations this switchboard would write. Set up an identity (ph login) to create v2-required documents.",
    );
    return "legacy";
  }
  return policy;
}
