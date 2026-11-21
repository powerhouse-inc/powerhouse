/**
 * The agent's signer and the rules for what it may write.
 *
 * Client-agnostic: nothing here calls a reactor. A host that holds an
 * identity (a signer whose `user` is set once the owner has signed in or
 * delegated to it) wraps it with `createGatedSigner`, so a write that needs a
 * signature while the signer has no user is refused with
 * `SignerNotReadyError` instead of going out unsigned. `canWrite` answers,
 * without a reactor call, whether the agent may write a document right now;
 * triggers read it through `ReactorContext.writes` (see `writes.ts`).
 */
import type { SignaturePolicy } from "@powerhousedao/shared/document-model";

export type { SignaturePolicy };

/** Structural slice of document-model's `ISigner` this module touches. */
export interface SignerLike {
  user?: { address: string; networkId?: string; chainId?: number };
  app?: { name?: string; key: string };
  signAction: (...args: never[]) => Promise<unknown>;
}

/** A document header as far as the write rules read it. */
export interface DocumentHeaderLike {
  header: {
    id: string;
    documentType?: string;
    protocolVersions?: Record<string, number> | null;
  };
}

/** The agent cannot sign yet: its signer has no user. */
export class SignerNotReadyError extends Error {
  constructor(what = "this write") {
    super(`The agent cannot sign ${what} yet: it has no signed-in identity.`);
    this.name = "SignerNotReadyError";
  }
}

/** True when the signer can sign as a user. */
export function signerReady(signer: SignerLike): boolean {
  return Boolean(signer.user?.address);
}

/** The policy a header carries (same rule as document-model's `signaturePolicyOf`). */
export function policyOfHeader(
  header: DocumentHeaderLike["header"] | undefined,
): SignaturePolicy {
  const version = header?.protocolVersions?.signature;
  return typeof version === "number" && version >= 2 ? "v2-required" : "legacy";
}

/**
 * The signer, refusing to sign while it has no user. Everything else is read
 * through to the live signer.
 */
export function createGatedSigner<S extends SignerLike>(signer: S): S {
  return new Proxy(signer, {
    get(target, prop, receiver) {
      if (prop === "signAction") {
        return async (...args: never[]) => {
          if (!signerReady(target)) throw new SignerNotReadyError();
          return target.signAction(...args);
        };
      }
      const value = Reflect.get(target, prop, receiver) as unknown;
      return typeof value === "function"
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

export interface WriteRules {
  ready(): boolean;
  /**
   * `refuse`: the agent leaves legacy documents alone.
   * `sign-when-ready`: legacy documents are writable whether or not the
   * signer has a user.
   */
  legacyDocuments: "refuse" | "sign-when-ready";
  /** Which documents the agent acts on by itself. Only read by `canWrite`. */
  accepts?: (document: DocumentHeaderLike) => boolean;
}

/** Whether the agent may write `document` right now (no reactor call). */
export function canWrite(
  rules: WriteRules,
  document: DocumentHeaderLike,
): boolean {
  if (rules.accepts && !rules.accepts(document)) return false;
  if (policyOfHeader(document.header) === "v2-required") return rules.ready();
  return rules.legacyDocuments !== "refuse";
}
