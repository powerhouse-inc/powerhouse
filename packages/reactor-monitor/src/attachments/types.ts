import type {
  AttachmentReplicationEntry,
  AttachmentReplicatorStatus,
  AttachmentRetryPolicy,
  IAttachmentStore,
  IOperationAttachmentRefs,
} from "@powerhousedao/reactor-attachments/replication";
import type { MessagePortLike } from "@powerhousedao/reactor";

/**
 * Attachment byte movement for one provisioned reactor (multi-reactor W3.4).
 *
 * Absent from a descriptor, the reactor gets no attachment store and no
 * replicator at all -- which is the pre-W3.4 behaviour and stays the default,
 * because a reactor that holds no bytes is a legitimate (and cheap) thing to
 * provision.
 */
export type ReactorAttachmentsConfig = {
  /**
   * Where bytes live.
   *
   * `idb` is the browser-resident store that survives a reload; `memory` is
   * ephemeral and what a Node test or a throwaway reactor wants. The names
   * match {@link ReactorStorageConfig} deliberately -- the operation store and
   * the attachment store answer the same question -- but they are configured
   * separately, because a reactor can reasonably want a durable operation
   * store and a disposable byte cache.
   */
  store: "idb" | "memory";
  /**
   * Explicit Switchboard origin for the HTTP transport.
   *
   * Normally unnecessary: the transport derives its Switchboard sources from
   * the reactor's OWN gql remotes at fetch time, so adding a remote in the
   * Sync tab is all it takes to make its bytes reachable. Set this only for an
   * attachment host that is not one of the reactor's sync remotes.
   */
  switchboardUrl?: string;
  /**
   * How refs are pulled out of a committed operation. In-process only -- it is
   * a function and cannot cross into a worker.
   *
   * Defaults to `SchemaCompiledOperationRefs` over the reactor's own model
   * registry, which finds exactly the refs a document model DECLARES as
   * `AttachmentRef` fields. A reactor whose models carry refs by another
   * convention (and the monitor's own default `baseDocumentModels`, which
   * declare no attachment field at all) passes its own.
   */
  refs?: IOperationAttachmentRefs;
  retry?: Partial<AttachmentRetryPolicy>;
  concurrency?: number;
  verifyHash?: boolean;
};

/**
 * One end of a monitor-brokered attachment link.
 *
 * The byte analog of {@link AdoptLocalSyncPeerLink}, and a SEPARATE port on
 * purpose: attachment bodies are large and chunked, and interleaving them with
 * the `LocalChannel` sync wire would make a big transfer delay operation
 * delivery on the same port.
 */
export type AdoptAttachmentPeerLink = {
  /** The peer reactor's name; how this link is identified and removed. */
  peerId: string;
  /** Channel label the broker derived; the registry key's second half. */
  channelName: string;
  port: MessagePortLike;
};

/** What a reactor has served to its linked peers. */
export type AttachmentServedStats = {
  served: number;
  bytesServed: number;
  refused: number;
};

/**
 * The attachment surface on a provisioned reactor: the store, the replicator's
 * observable state, and the levers over both.
 *
 * Present only when the descriptor asked for attachments AND the reactor is
 * one this process built -- see {@link ManagedReactorBase.attachments}.
 */
export interface ManagedAttachments {
  /** This reactor's own byte store. */
  readonly store: IAttachmentStore;
  /** Which store class was built; what the inspector labels it with. */
  readonly storeKind: "idb" | "memory";
  /** Counts: refs seen, bytes held, pending, not-found. */
  status(): Promise<AttachmentReplicatorStatus>;
  /** Per-hash detail behind {@link status}. */
  report(): AttachmentReplicationEntry[];
  /** Re-chases terminal hashes; the manual lever over a lagging peer index. */
  retry(hash?: string): void;
  /** What this reactor has handed out to peers. */
  servedStats(): AttachmentServedStats;
  /** Names of the linked peers this reactor can currently pull bytes from. */
  peers(): readonly string[];
  /** The Switchboard origins the transport would currently try. */
  switchboardSources(): readonly string[];
  /** Adopts one end of a brokered attachment link. */
  adoptPeer(link: AdoptAttachmentPeerLink): Promise<void>;
  /** Drops a peer link (closing its port). */
  removePeer(peerId: string, channelName: string): Promise<void>;
}
