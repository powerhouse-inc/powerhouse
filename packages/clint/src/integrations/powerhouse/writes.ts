/**
 * `ReactorContext.writes` and the `powerhouse:writes:ready` event, built once
 * for whichever factory makes the reactor: one wrapping `attachRemoteReactor`
 * in `configureReactor.create` (it hands the returned `signer` to the client)
 * or the embedded `buildDefaultReactor`.
 */
import type { ISigner } from "@powerhousedao/shared/document-model";
import {
  SignerNotReadyError,
  canWrite,
  createGatedSigner,
  signerReady,
  type DocumentHeaderLike,
  type WriteRules,
} from "./signing.js";
import type { ReactorWrites } from "./types.js";

export interface ReactorWritesOptions {
  /**
   * The agent's signer. Read on every write, so a signer whose `user` is set
   * later (a sign-in) takes effect without rebuilding the reactor. Without
   * one there is nothing to wait for: `ready()` is always true.
   */
  signer?: ISigner;
  /** See `WriteRules.legacyDocuments`. Default: `sign-when-ready`. */
  legacyDocuments?: WriteRules["legacyDocuments"];
  /**
   * Which documents the agent acts on by itself (`writes.canWrite`, read by
   * triggers such as the chat watch). Writes the agent is asked to make
   * follow only the signature rules.
   */
  accepts?: (document: DocumentHeaderLike) => boolean;
  /**
   * Subscribe to changes of the signer's user; `powerhouse:writes:ready` is
   * emitted when writes become possible. Returns an unsubscribe function.
   */
  onSignerChange?: (listener: () => void) => () => void;
  /** Where `powerhouse:writes:ready` goes: the factory's `ctx.emit`. */
  emit?: (
    event: "powerhouse:writes:ready",
    data: Record<string, never>,
  ) => void;
}

export interface ReactorWritesHandle {
  /** For `ReactorContext.writes`. */
  writes: ReactorWrites;
  /**
   * The signer to give the reactor client (`attachRemoteReactor({ signer })`),
   * resolved per push: the gated signer, or `SignerNotReadyError` while it
   * has no user. The resolver throws rather than returning undefined because
   * `GraphQLReactorClient` pushes unsigned when it gets no signer, and checks
   * `user` itself before it would call the gated `signAction`. Undefined
   * without a signer.
   *
   * Limit: the client resolves its signer before it knows the document, so
   * while there is no user this refuses a push to a legacy document too,
   * though `legacyDocuments: "sign-when-ready"` lets `canWrite` pass it.
   * Passing the target document to the resolver would lift it; until then
   * give a signer only where the documents written are v2.
   */
  signer?: () => ISigner;
  /** Stops watching the signer; call it from `ReactorContext.shutdown`. */
  stop(): void;
}

/** See {@link ReactorWritesOptions} and {@link ReactorWritesHandle}. */
export function createReactorWrites(
  options: ReactorWritesOptions = {},
): ReactorWritesHandle {
  const source = options.signer;
  const rules: WriteRules = {
    ready: () => (source ? signerReady(source) : true),
    legacyDocuments: options.legacyDocuments ?? "sign-when-ready",
    accepts: options.accepts,
  };
  const writes: ReactorWrites = {
    ready: rules.ready,
    canWrite: (document) => canWrite(rules, document),
  };

  let signer: (() => ISigner) | undefined;
  if (source) {
    const gated = createGatedSigner(source);
    signer = () => {
      if (!signerReady(source)) throw new SignerNotReadyError();
      return gated;
    };
  }

  let wasReady = rules.ready();
  const unsubscribe = options.onSignerChange?.(() => {
    const now = rules.ready();
    if (now && !wasReady) options.emit?.("powerhouse:writes:ready", {});
    wasReady = now;
  });

  return {
    writes,
    signer,
    stop: () => unsubscribe?.(),
  };
}
