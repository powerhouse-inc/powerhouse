import {
  messagePortTransport,
  type IDocumentModelRegistry,
  type IEventBus,
  type ISyncManager,
  type JwtHandler,
} from "@powerhousedao/reactor";
import {
  AttachmentPeerLinks,
  AttachmentReplicator,
  IdbAttachmentBackend,
  LocalAttachmentStore,
  MemoryAttachmentBackend,
  PeeredAttachmentTransport,
  SchemaCompiledOperationRefs,
  type IAttachmentReferenceScanner,
  type ILocalAttachmentBackend,
  type LocalAttachmentAuthorizer,
} from "@powerhousedao/reactor-attachments/replication";
import type {
  AdoptAttachmentPeerLink,
  ManagedAttachments,
  ReactorAttachmentsConfig,
} from "./types.js";

/** Every linked peer is the operator's own reactor in this dev tool. */
export const TRUST_OWN_PEERS: LocalAttachmentAuthorizer = () =>
  Promise.resolve(true);

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
  /** Re-scanned on start; absent, refs are learned from live operations only. */
  backlog?: IAttachmentReferenceScanner;
  onDiagnostic?: (message: string, error?: unknown) => void;
};

/** The attachment half of a built reactor. */
export type AttachmentModule = {
  store: LocalAttachmentStore;
  replicator: AttachmentReplicator;
  transport: PeeredAttachmentTransport;
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
  // Per reactor: two reactors in one origin must not share a byte store.
  return new IdbAttachmentBackend({
    databaseName: `${namespace}-attachments`,
  });
}

/** The caller starts the replicator once the reactor is up. */
export function buildAttachmentModule(
  options: BuildAttachmentModuleOptions,
): AttachmentModule {
  const onDiagnostic =
    options.onDiagnostic ??
    ((message: string, error?: unknown): void => {
      console.error(`[reactor-monitor] attachments: ${message}`, error);
    });

  const transport = new PeeredAttachmentTransport({
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
      undefined,
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

  const links = new AttachmentPeerLinks({
    store,
    transport,
    authorize: TRUST_OWN_PEERS,
    // A new peer may hold bytes this reactor gave up on.
    onPeerAdded: () => replicator.retry(),
    onDiagnostic,
  });

  const managed: ManagedAttachments = {
    store,
    storeKind: options.config.store,
    status: () => replicator.status(),
    report: () => replicator.report(),
    retry: (hash?: string) => replicator.retry(hash),
    servedStats: () => links.servedStats(),
    peers: () => transport.peerNames(),
    switchboardSources: () => transport.switchboardSources(),
    adoptPeer: (link: AdoptAttachmentPeerLink): Promise<void> => {
      try {
        links.addPeer(
          link.peerId,
          link.channelName,
          messagePortTransport(link.port),
        );
      } catch (error) {
        return Promise.reject(error as Error);
      }
      return Promise.resolve();
    },
    removePeer: (peerId: string, channelName: string): Promise<void> => {
      if (!links.removePeer(peerId, channelName)) {
        return Promise.reject(
          new Error(
            `This reactor has no attachment link to peer '${peerId}' on channel '${channelName}' to remove`,
          ),
        );
      }
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
      links.close();
      await store.close();
    },
  };
}
