import type { SignatureVerificationHandler } from "@powerhousedao/reactor";

/**
 * Imported by executor worker threads via SignatureVerifierSpec; built as its
 * own tsdown entry so it exists standalone in dist. Returns no handler —
 * parity with the in-process executor, which switchboard builds without one.
 */
export function createWorkerSignatureVerifier():
  | SignatureVerificationHandler
  | undefined {
  return undefined;
}
