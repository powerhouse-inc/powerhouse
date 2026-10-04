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
 * Opens (or re-opens) the link. Both sides send one on init, and again on a
 * reconnect, so the exchange is symmetric without either side replying.
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

/** Whether a received value is a well-formed wire message. */
export function isLocalWireMessage(data: unknown): data is LocalWireMessage {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const kind = (data as { kind?: unknown }).kind;
  return (
    kind === "hello" || kind === "push" || kind === "ack" || kind === "resend"
  );
}
