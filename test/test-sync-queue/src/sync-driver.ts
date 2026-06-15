import {
  ChannelScheme,
  DriveCollectionId,
  PollBehavior,
  ReactorBuilder,
  ReactorEventTypes,
  SyncEventTypes,
  type IEventBus,
  type IQueue,
  type ISyncManager,
  type IReactor,
  type Remote,
  type Unsubscribe,
} from "@powerhousedao/reactor";
import { HttpPackageLoader } from "@powerhousedao/reactor-api";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type {
  DriverState,
  EnvelopeSummary,
  EventKind,
  InboxAddedDetail,
  MailboxSnapshot,
  ObservedEvent,
  OutboxItemDetail,
  SyncDriverConfig,
} from "./types.js";

interface DriveInfo {
  id: string;
  graphqlEndpoint: string;
}

export type EventHandler = (event: ObservedEvent) => void;

export class SyncDriver {
  private readonly config: SyncDriverConfig;
  private reactor!: IReactor;
  private syncManager!: ISyncManager;
  private queue!: IQueue;
  private eventBus!: IEventBus;
  private remote!: Remote;
  private remoteName!: string;
  private driveId!: string;
  private unsubscribes: Array<() => void> = [];
  private handlers: EventHandler[] = [];

  constructor(config: SyncDriverConfig) {
    this.config = config;
  }

  async init(): Promise<void> {
    const driveInfo = await this.resolveDriveInfo(this.config.url);

    const baseDocumentModels: DocumentModelModule<any>[] = [
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ];

    const httpLoader = new HttpPackageLoader({
      registryUrl: this.config.registryUrl,
    });

    const builder = new ReactorBuilder()
      .withDocumentModels(baseDocumentModels)
      .withChannelScheme(ChannelScheme.CONNECT)
      .withDocumentModelLoader(httpLoader.documentModelLoader);

    if (this.config.jwt) {
      const token = this.config.jwt;
      builder.withJwtHandler(async () => token);
    }

    const module = await builder.buildModule();
    this.reactor = module.reactor;
    this.queue = module.queue;
    this.eventBus = module.eventBus;

    if (!module.syncModule) {
      throw new Error(
        "SyncModule was not constructed. Check ReactorBuilder.withChannelScheme.",
      );
    }
    this.syncManager = module.syncModule.syncManager;

    this.driveId = driveInfo.id;
    const collectionId = DriveCollectionId.forDrive(
      driveInfo.id,
      this.config.branch,
    );
    this.remoteName = `debug-${driveInfo.id}`;

    this.remote = await this.syncManager.add(
      this.remoteName,
      collectionId,
      {
        type: "gql",
        parameters: { url: driveInfo.graphqlEndpoint },
      },
      undefined,
      { pollBehavior: PollBehavior.Manual },
    );

    this.wireEvents();
  }

  onEvent(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  pollOnce(): { inboxLatestBefore: number; inboxLatestAfter: number } {
    const before = this.remote.channel.inbox.latestOrdinal;
    this.syncManager.triggerPull(this.remoteName);
    const after = this.remote.channel.inbox.latestOrdinal;
    return { inboxLatestBefore: before, inboxLatestAfter: after };
  }

  getOutboxDetails(): OutboxItemDetail[] {
    const items = this.remote.channel.outbox.items as ReadonlyArray<{
      id: string;
      documentId: string;
      scopes: string[];
      branch: string;
      operations: ReadonlyArray<{
        operation: { index: number; action: { type: string } };
        context: { ordinal: number; scope: string };
      }>;
    }>;
    return items.map((item) => {
      const opsByScope = new Map<
        string,
        {
          firstIndex: number;
          lastIndex: number;
          firstOrdinal: number;
          lastOrdinal: number;
          types: Set<string>;
        }
      >();
      for (const op of item.operations) {
        const scope = op.context.scope;
        let bucket = opsByScope.get(scope);
        if (!bucket) {
          bucket = {
            firstIndex: op.operation.index,
            lastIndex: op.operation.index,
            firstOrdinal: op.context.ordinal,
            lastOrdinal: op.context.ordinal,
            types: new Set<string>(),
          };
          opsByScope.set(scope, bucket);
        } else {
          if (op.operation.index < bucket.firstIndex)
            bucket.firstIndex = op.operation.index;
          if (op.operation.index > bucket.lastIndex)
            bucket.lastIndex = op.operation.index;
          if (op.context.ordinal < bucket.firstOrdinal)
            bucket.firstOrdinal = op.context.ordinal;
          if (op.context.ordinal > bucket.lastOrdinal)
            bucket.lastOrdinal = op.context.ordinal;
        }
        bucket.types.add(op.operation.action.type);
      }
      return {
        id: item.id,
        documentId: item.documentId,
        branch: item.branch,
        opCount: item.operations.length,
        perScope: [...opsByScope.entries()].map(([scope, b]) => ({
          scope,
          firstIndex: b.firstIndex,
          lastIndex: b.lastIndex,
          firstOrdinal: b.firstOrdinal,
          lastOrdinal: b.lastOrdinal,
          actionTypes: [...b.types],
        })),
      };
    });
  }

  async getState(): Promise<DriverState> {
    const inbox = this.snapshotMailbox("inbox");
    const outbox = this.snapshotMailbox("outbox");
    const deadLetter = this.snapshotMailbox("deadLetter");
    const queueTotal = await this.queue.totalSize();
    return {
      inbox,
      outbox,
      deadLetter,
      queueTotal,
      queueDrained: this.queue.isDrained,
    };
  }

  getRemoteName(): string {
    return this.remoteName;
  }

  getDriveId(): string {
    return this.driveId;
  }

  async shutdown(): Promise<void> {
    for (const unsubscribe of this.unsubscribes) {
      try {
        unsubscribe();
      } catch {
        // best-effort
      }
    }
    this.unsubscribes = [];
    try {
      this.syncManager.shutdown();
    } catch {
      // ignore
    }
    try {
      this.reactor.kill();
    } catch {
      // ignore
    }
  }

  private snapshotMailbox(
    which: "inbox" | "outbox" | "deadLetter",
  ): MailboxSnapshot {
    const mailbox = this.remote.channel[which];
    return {
      size: mailbox.items.length,
      ackOrdinal: mailbox.ackOrdinal,
      latestOrdinal: mailbox.latestOrdinal,
    };
  }

  private async resolveDriveInfo(url: string): Promise<DriveInfo> {
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      throw new Error(
        `Failed to fetch drive info from ${url}: ${(err as Error).message}`,
      );
    }
    if (!response.ok) {
      throw new Error(
        `Drive info fetch returned ${response.status} ${response.statusText} for ${url}`,
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (err) {
      throw new Error(
        `Drive info response was not valid JSON: ${(err as Error).message}`,
      );
    }
    if (
      typeof body !== "object" ||
      body === null ||
      typeof (body as DriveInfo).id !== "string" ||
      typeof (body as DriveInfo).graphqlEndpoint !== "string"
    ) {
      throw new Error(
        `Drive info response missing id or graphqlEndpoint: ${JSON.stringify(body)}`,
      );
    }
    return body as DriveInfo;
  }

  private wireEvents(): void {
    const reactorEvents: Array<[number, EventKind]> = [
      [ReactorEventTypes.JOB_PENDING, "JOB_PENDING"],
      [ReactorEventTypes.JOB_RUNNING, "JOB_RUNNING"],
      [ReactorEventTypes.JOB_WRITE_READY, "JOB_WRITE_READY"],
      [ReactorEventTypes.JOB_READ_READY, "JOB_READ_READY"],
      [ReactorEventTypes.JOB_FAILED, "JOB_FAILED"],
      [SyncEventTypes.SYNC_PENDING, "SYNC_PENDING"],
      [SyncEventTypes.SYNC_SUCCEEDED, "SYNC_SUCCEEDED"],
      [SyncEventTypes.SYNC_FAILED, "SYNC_FAILED"],
      [SyncEventTypes.DEAD_LETTER_ADDED, "DEAD_LETTER_ADDED"],
      [SyncEventTypes.CONNECTION_STATE_CHANGED, "CONNECTION_STATE_CHANGED"],
    ];
    for (const [type, kind] of reactorEvents) {
      const sub = this.eventBus.subscribe(type, (_, data) => {
        this.emit(kind, this.summariseEventDetail(kind, data));
      });
      this.unsubscribes.push(sub as Unsubscribe);
    }

    const inbox = this.remote.channel.inbox;
    const outbox = this.remote.channel.outbox;
    const deadLetter = this.remote.channel.deadLetter;

    inbox.onAdded((items) => {
      const detail: InboxAddedDetail = {
        count: items.length,
        envelopes: items.map(summariseEnvelope),
      };
      this.emit("INBOX_ADDED", detail);
    });
    inbox.onRemoved((items) => {
      this.emit("INBOX_REMOVED", { count: items.length, ids: ids(items) });
    });
    outbox.onAdded((items) => {
      this.emit("OUTBOX_ADDED", { count: items.length, ids: ids(items) });
    });
    outbox.onRemoved((items) => {
      this.emit("OUTBOX_REMOVED", { count: items.length, ids: ids(items) });
    });
    deadLetter.onAdded((items) => {
      this.emit("DEADLETTER_ADDED", { count: items.length, ids: ids(items) });
    });
  }

  private emit(kind: EventKind, detail: unknown): void {
    const event: ObservedEvent = { ts: Date.now(), kind, detail };
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        // diagnostic handler errors are not fatal
      }
    }
  }

  private summariseEventDetail(kind: EventKind, data: unknown): unknown {
    if (data === null || typeof data !== "object") {
      return data;
    }
    const record = data as Record<string, unknown>;
    switch (kind) {
      case "JOB_PENDING":
      case "JOB_RUNNING":
      case "JOB_WRITE_READY":
      case "JOB_READ_READY":
        return {
          jobId: record.jobId,
          operationCount: Array.isArray(record.operations)
            ? record.operations.length
            : undefined,
        };
      case "JOB_FAILED":
        return {
          jobId: record.jobId,
          error:
            record.error instanceof Error
              ? record.error.message
              : String(record.error),
        };
      case "SYNC_PENDING":
      case "SYNC_SUCCEEDED":
      case "SYNC_FAILED":
        return record;
      case "DEAD_LETTER_ADDED":
        return record;
      case "CONNECTION_STATE_CHANGED":
        return record;
      default:
        return record;
    }
  }
}

function ids(items: ReadonlyArray<{ id: string }>): string[] {
  return items.map((i) => i.id);
}

interface EnvelopeLike {
  id: string;
  documentId: string;
  scopes: string[];
  branch: string;
  operations: ReadonlyArray<{
    operation: { index: number; action: { type: string } };
    context: { documentType: string; ordinal: number };
  }>;
}

function summariseEnvelope(item: EnvelopeLike): EnvelopeSummary {
  const ops = item.operations;
  let firstIndex = Number.POSITIVE_INFINITY;
  let lastIndex = Number.NEGATIVE_INFINITY;
  let firstOrdinal = Number.POSITIVE_INFINITY;
  let lastOrdinal = Number.NEGATIVE_INFINITY;
  let hasCreate = false;
  const actionTypes = new Set<string>();
  let documentType = "";

  for (const op of ops) {
    const idx = op.operation.index;
    if (idx < firstIndex) firstIndex = idx;
    if (idx > lastIndex) lastIndex = idx;
    const ord = op.context.ordinal;
    if (ord < firstOrdinal) firstOrdinal = ord;
    if (ord > lastOrdinal) lastOrdinal = ord;
    const t = op.operation.action.type;
    actionTypes.add(t);
    if (t === "CREATE_DOCUMENT") hasCreate = true;
    if (!documentType && op.context.documentType) {
      documentType = op.context.documentType;
    }
  }

  return {
    envelopeId: item.id,
    documentId: item.documentId,
    documentType,
    scopes: item.scopes.slice(),
    branch: item.branch,
    opCount: ops.length,
    firstIndex: Number.isFinite(firstIndex) ? firstIndex : -1,
    lastIndex: Number.isFinite(lastIndex) ? lastIndex : -1,
    firstOrdinal: Number.isFinite(firstOrdinal) ? firstOrdinal : -1,
    lastOrdinal: Number.isFinite(lastOrdinal) ? lastOrdinal : -1,
    actionTypes: [...actionTypes],
    hasCreate,
  };
}
