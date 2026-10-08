import type { PeerManifest } from "@powerhousedao/shared/document-model";
import type { RemoteFilter } from "../types.js";

/**
 * The messages two {@link LocalChannel}s exchange over a message port.
 *
 * The protocol is a stream, not a request/response: either side may send any
 * message at any time and nothing is correlated by a reply. It is the symmetric
 * analog of the gql channels' touchChannel/pushSyncEnvelopes/ackOrdinal, carried
 * as structured-clone-safe plain data so a real MessagePort can clone it -- no
 * functions, no class instances on the wire.
 *
 * Ordinal discipline mirrors the gql channels (see sync/design.md:178-204): an
 * ordinal a side reports is always how far IT has applied of what the PEER sent,
 * i.e. an ordinal in the peer's outbox frame. The receiver of such a report
 * trims its own outbox against it with `trimMailboxFromAckOrdinal`.
 */
export type LocalWireMessage =
  | LocalHelloMessage
  | LocalPushMessage
  | LocalAckMessage
  | LocalResendMessage;

/** Identifies which end of the handshake sent a message, for diagnostics. */
export type LocalWireKind = "hello" | "push" | "ack" | "resend";

/**
 * Opens (or re-opens) the link. Each side sends one on init. A side that hears
 * an opening hello answers with one marked `reply`, so a side that resets while
 * its peer stays up still completes a handshake; a reply is never answered.
 *
 * `sinceOrdinal` is the sender's inbox ack: the peer trims its outbox up to it,
 * exactly as it would on an {@link LocalAckMessage}, so a HELLO after a restart
 * resumes without re-serving what the sender already applied. `manifest` is the
 * sender's PeerManifest (null for a peer that announces nothing), which drives
 * the receiver's version-skew holds.
 */
export type LocalHelloMessage = {
  kind: "hello";
  channelId: string;
  collectionId: string;
  filter: RemoteFilter;
  sinceOrdinal: number;
  manifest: PeerManifest | null;
  reply?: boolean;
};

/**
 * Carries sync envelopes to the peer's inbox. `envelopes` is the output of
 * `serializeEnvelope`, which the receiver feeds back through
 * `envelopesToSyncOperations`; the pair keeps the payload clone-safe and
 * preserves key/dependsOn batch ordering across the wire.
 */
export type LocalPushMessage = {
  kind: "push";
  channelId: string;
  envelopes: unknown[];
};

/**
 * Advances the peer's knowledge of what this side has applied. `ackOrdinal` is
 * this side's inbox ack (the peer's outbox frame); the peer trims its outbox up
 * to it. Sent whenever the inbox cursor advances.
 */
export type LocalAckMessage = {
  kind: "ack";
  channelId: string;
  ackOrdinal: number;
};

/**
 * Asks the peer to re-push whatever it still holds unacked for this side. It is
 * the push transport's stand-in for a pull: there is nothing to poll, so a
 * resend request carries this side's inbox ack both to trim the peer's outbox
 * and to let the peer re-send the remainder.
 */
export type LocalResendMessage = {
  kind: "resend";
  channelId: string;
  sinceOrdinal: number;
};

/**
 * Whether a received value is a well-formed wire message.
 *
 * A push is validated down to what `envelopesToSyncOperations` dereferences:
 * each envelope's `channelMeta.id` and, per operation, the `operation.action`
 * and the `context` fields it batches on.
 */
export function isLocalWireMessage(data: unknown): data is LocalWireMessage {
  if (!isObject(data)) {
    return false;
  }
  const kind = data.kind;
  if (kind === "push") {
    return Array.isArray(data.envelopes) && data.envelopes.every(isEnvelope);
  }
  return kind === "hello" || kind === "ack" || kind === "resend";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEnvelope(envelope: unknown): boolean {
  if (!isObject(envelope)) return false;
  if (!isObject(envelope.channelMeta)) return false;
  if (typeof envelope.channelMeta.id !== "string") return false;
  const operations = envelope.operations;
  return (
    operations === undefined ||
    operations === null ||
    (Array.isArray(operations) && operations.every(isWireOperation))
  );
}

function isWireOperation(entry: unknown): boolean {
  if (!isObject(entry)) return false;
  const { operation, context } = entry;
  return (
    isObject(operation) &&
    isObject(operation.action) &&
    isObject(context) &&
    typeof context.documentId === "string" &&
    typeof context.scope === "string" &&
    typeof context.branch === "string" &&
    typeof context.ordinal === "number"
  );
}
