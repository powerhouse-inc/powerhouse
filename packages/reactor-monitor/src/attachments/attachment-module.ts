import {
  messagePortTransport,
  type IDocumentModelRegistry,
  type IEventBus,
  type ISyncManager,
  type JwtHandler,
  type LocalChannelPort,
} from "@powerhousedao/reactor";
import {
  attachmentReferenceAuthorizer,
  AttachmentReplicator,
  AttachmentSchemaCompiler,
  IdbAttachmentBackend,
  LocalAttachmentServer,
  LocalAttachmentStore,
  LocalAttachmentTransport,
  MemoryAttachmentBackend,
  SchemaCompiledOperationRefs,
  type IAttachmentReferenceBacklog,
  type IAttachmentReferenceReader,
  type ILocalAttachmentBackend,
} from "@powerhousedao/reactor-attachments/replication";
import { MonitorAttachmentTransport } from "./monitor-attachment-transport.js";
import type {
  AdoptAttachmentPeerLink,
  AttachmentServedStats,
  ManagedAttachments,
  ReactorAttachmentsConfig,
} from "./types.js";

export type BuildAttachmentModuleOptions = {
  config: ReactorAttachmentsConfig;
  /** Storage namespace; the IndexedDB database name is derived from it. */
  namespace: string;
  /** The reactor's bus; what the replicator subscribes to. */
  eventBus: IEventBus;
  /** For the default schema-compiled ref extractor. */
  documentModelRegistry: IDocumentModelRegistry;
  /** Read at fetch time for the reactor's gql remotes. */
  syncManager?: ISyncManager;
  jwtHandler?: JwtHandler;
  /**
   * Authorizes what this reactor serves to peers. Absent, a linked peer may
   * read any hash this store holds -- the right posture for a lab bench where
   * every reactor belongs to the same operator, and stated rather than
   * implied.
   */
  referenceReader?: IAttachmentReferenceReader;
  /**
   * The durable reference list the replicator re-scans on boot. Absent, the
   * replicator learns about refs only from live operations and reports
   * `backlogScanned: false`, which is the honest reading of a reactor that
   * registered no attachment reference index.
   */
  backlog?: IAttachmentReferenceBacklog;
  onDiagnostic?: (message: string, error?: unknown) => void;
};

/** One peer link: the pair that serves bytes and the pair that pulls them. */
type PeerLink = {
  server: LocalAttachmentServer;
  transport: LocalAttachmentTransport;
  port: LocalChannelPort;
  peerId: string;
  channelName: string;
};

/** The attachment half of a built reactor. */
export type AttachmentModule = {
  store: LocalAttachmentStore;
  replicator: AttachmentReplicator;
  transport: MonitorAttachmentTransport;
  /** The surface put on the `ManagedReactor` handle. */
  managed: ManagedAttachments;
  /** Stops the replicator, drops every peer link, closes the store. */
  shutdown: () => Promise<void>;
};

function backendFor(
  config: ReactorAttachmentsConfig,
  namespace: string,
): ILocalAttachmentBackend {
  if (config.store === "memory") {
    return new MemoryAttachmentBackend();
  }
  // Namespaced per reactor, like the operation store: two monitor reactors in
  // one origin must not share evictions or storage accounting.
  return new IdbAttachmentBackend({
    databaseName: `${namespace}-attachments`,
  });
}

/**
 * Builds a reactor's attachment store, its replicator, and the transport both
 * sit on (multi-reactor W3.4).
 *
 * The replicator is NOT started here. `buildMonitorReactor` starts it after
 * the reactor itself is up, so a fetch cannot race the reactor's own boot.
 *
 * Peer links are held as eagerly-constructed `(server, transport)` pairs
 * rather than in a `LocalChannelPortRegistry`. That registry exists to answer
 * a `LocalChannelTransportProvider` lookup from a channel factory, which has
 * no analog here: nothing looks an attachment port up later, because adopting
 * one builds both halves on the spot.
 */
export function buildAttachmentModule(
  options: BuildAttachmentModuleOptions,
): AttachmentModule {
  const onDiagnostic =
    options.onDiagnostic ??
    ((message: string, error?: unknown): void => {
      console.error(`[reactor-monitor] attachments: ${message}`, error);
    });

  const transport = new MonitorAttachmentTransport({
    ...(options.syncManager ? { syncManager: options.syncManager } : {}),
    ...(options.config.switchboardUrl !== undefined
      ? { switchboardUrl: options.config.switchboardUrl }
      : {}),
    ...(options.jwtHandler ? { jwtHandler: options.jwtHandler } : {}),
  });

  const store = new LocalAttachmentStore(
    backendFor(options.config, options.namespace),
    transport,
  );

  const refs =
    options.config.refs ??
    new SchemaCompiledOperationRefs(
      options.documentModelRegistry,
      new AttachmentSchemaCompiler(),
      onDiagnostic,
    );

  const replicator = new AttachmentReplicator({
    store,
    transport,
    refs,
    eventBus: options.eventBus,
    ...(options.backlog ? { backlog: options.backlog } : {}),
    ...(options.config.concurrency !== undefined
      ? { concurrency: options.config.concurrency }
      : {}),
    ...(options.config.retry ? { retry: options.config.retry } : {}),
    ...(options.config.verifyHash !== undefined
      ? { verifyHash: options.config.verifyHash }
      : {}),
    onDiagnostic,
  });

  // Keyed by `(peerId, channelName)`, mirroring the sync-link registry: two
  // links to the same peer on different channels (a second collection) must
  // coexist, so neither adopting nor dropping one may touch the other.
  const links = new Map<string, PeerLink>();
  const linkKey = (peerId: string, channelName: string): string =>
    `${peerId}\u0000${channelName}`;

  const dropPeer = (peerId: string, channelName: string): void => {
    const key = linkKey(peerId, channelName);
    const link = links.get(key);
    if (!link) {
      return;
    }
    links.delete(key);
    transport.removePeer(peerId, channelName);
    link.server.close();
    link.transport.close();
    try {
      link.port.close();
    } catch {
      // A port the far realm owns is not ours to close.
    }
  };

  const managed: ManagedAttachments = {
    store,
    storeKind: options.config.store,
    status: () => replicator.status(),
    report: () => replicator.report(),
    retry: (hash?: string) => replicator.retry(hash),
    servedStats: (): AttachmentServedStats => {
      const total: AttachmentServedStats = {
        served: 0,
        bytesServed: 0,
        refused: 0,
      };
      for (const link of links.values()) {
        const stats = link.server.stats();
        total.served += stats.served;
        total.bytesServed += stats.bytesServed;
        total.refused += stats.refused;
      }
      return total;
    },
    peers: () => transport.peerNames(),
    switchboardSources: () => transport.switchboardSources(),
    adoptPeer: (link: AdoptAttachmentPeerLink): Promise<void> => {
      const key = linkKey(link.peerId, link.channelName);
      if (links.has(key)) {
        return Promise.reject(
          new Error(
            `This reactor already holds an attachment link to peer '${link.peerId}' on channel '${link.channelName}'; unlink it before brokering another`,
          ),
        );
      }
      const port = messagePortTransport(link.port);
      // Both halves on the one port: this reactor serves bytes to the peer AND
      // pulls bytes from it. They ignore each other's messages.
      const server = new LocalAttachmentServer({
        port,
        store,
        ...(options.referenceReader
          ? {
              authorize: attachmentReferenceAuthorizer(options.referenceReader),
            }
          : {}),
        onDiagnostic,
      });
      const peerTransport = new LocalAttachmentTransport({ port });
      try {
        transport.addPeer(link.peerId, link.channelName, peerTransport);
      } catch (error) {
        server.close();
        peerTransport.close();
        return Promise.reject(error as Error);
      }
      links.set(key, {
        server,
        transport: peerTransport,
        port,
        peerId: link.peerId,
        channelName: link.channelName,
      });
      // A newly linked peer may hold bytes this reactor gave up on, so every
      // terminal hash is worth one more ask. This is the same lever the
      // inspector's retry button pulls.
      replicator.retry();
      return Promise.resolve();
    },
    removePeer: (peerId: string, channelName: string): Promise<void> => {
      const link = links.get(linkKey(peerId, channelName));
      if (!link) {
        return Promise.reject(
          new Error(
            `This reactor has no attachment link to peer '${peerId}' on channel '${channelName}' to remove`,
          ),
        );
      }
      dropPeer(peerId, channelName);
      return Promise.resolve();
    },
  };

  return {
    store,
    replicator,
    transport,
    managed,
    shutdown: async () => {
      await replicator.stop();
      for (const link of [...links.values()]) {
        dropPeer(link.peerId, link.channelName);
      }
      await store.close();
    },
  };
}
