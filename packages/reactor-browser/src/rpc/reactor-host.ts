import type { IReactorClient } from "@powerhousedao/reactor";
import { toErrorInfo } from "./error-info.js";
import { ReactorHostServer } from "./host-server.js";
import { RPC_PROTOCOL_VERSION } from "./protocol.js";
import type {
  ClientMessage,
  CorrelationId,
  ReactorIdentity,
  RpcAdmin,
  RpcDbOp,
  RpcHello,
  RpcInspectorOp,
  RpcLiveSubscribe,
  RpcRegisterPackages,
  RpcSyncOp,
  RpcUnregisterPackages,
  VersionFingerprint,
  WorkerInspectorInfo,
  WorkerMigrationState,
} from "./protocol.js";

function isDataMessage(
  msg: ClientMessage,
): msg is ClientMessage & { id: CorrelationId } {
  return (
    msg.k === "req" ||
    msg.k === "sub" ||
    msg.k === "page" ||
    msg.k === "sync-op" ||
    msg.k === "db-op" ||
    msg.k === "inspector-op" ||
    msg.k === "sub-live"
  );
}
import { createPortTransport, type IRpcTransport } from "./transport.js";

export type ReactorHostOptions = {
  client?: IReactorClient;
  build?: (construct: unknown) => Promise<IReactorClient>;
  registerPackages?: (specs: string[]) => Promise<void>;
  unregisterPackages?: (names: string[]) => Promise<void>;
  onIdentity?: (user: ReactorIdentity | null) => void;
  onSyncOp?: (method: string, args: unknown[]) => Promise<unknown>;
  onDbOp?: (method: string, args: unknown[]) => Promise<unknown>;
  onInspectorOp?: (method: string, args: unknown[]) => Promise<unknown>;
  onLiveQuery?: (
    sql: string,
    params: unknown[],
    onResults: (results: unknown) => void,
  ) => Promise<() => void>;
  // Worker identity + restart for the admin/inspector channel.
  namespace?: string;
  appBuildId?: string;
  ownerId?: string;
  bootedAtMs?: number;
  onAdminRestart?: () => void;
  onAdminClearStorage?: () => Promise<void>;
  onAdminMigrate?: () => Promise<void>;
};

function versionsCompatible(
  a: VersionFingerprint,
  b: VersionFingerprint,
): boolean {
  return (
    a.appBuildId === b.appBuildId &&
    a.rpcProtocolVersion === b.rpcProtocolVersion
  );
}

// Deterministic per version so every new-build tab converges on one fresh worker.
function workerGenForVersion(version: VersionFingerprint): string {
  return `v${version.rpcProtocolVersion}-${version.appBuildId}`;
}

export class ReactorHost {
  private readonly options: ReactorHostOptions;
  private readonly disposers = new Set<() => void>();
  private readonly clients = new Set<IRpcTransport>();
  private clientPromise: Promise<IReactorClient> | null = null;
  private baseline: VersionFingerprint | null = null;
  private readonly ownerId: string;
  private readonly bootedAtMs: number;
  private migrationState: WorkerMigrationState | null = null;

  constructor(options: ReactorHostOptions) {
    this.options = options;
    this.ownerId = options.ownerId ?? crypto.randomUUID();
    this.bootedAtMs = options.bootedAtMs ?? Date.now();
    if (options.client) {
      this.clientPromise = Promise.resolve(options.client);
    }
  }

  connect(transport: IRpcTransport): () => void {
    let server: ReactorHostServer | null = null;
    const buffer: ClientMessage[] = [];
    const liveSubs = new Map<string, () => void>();

    const ensureServer = async (construct?: unknown): Promise<void> => {
      if (server) {
        return;
      }
      const client = await this.resolveClient(construct);
      server = new ReactorHostServer(client, transport);
      for (const message of buffer) {
        void server.handleMessage(message);
      }
      buffer.length = 0;
    };

    const detach = transport.onMessage((message) => {
      const msg = message as ClientMessage;
      if (msg.k === "ping") {
        transport.post({
          k: "pong",
          id: msg.id,
          ownerId: this.ownerId,
          bootedAtMs: this.bootedAtMs,
        });
        return;
      }
      if (this.migrationState?.status === "migrating" && isDataMessage(msg)) {
        transport.post({
          k: "err",
          id: msg.id,
          error: toErrorInfo(new Error("migration in progress")),
        });
        return;
      }
      if (msg.k === "hello") {
        void this.handleHello(msg, transport, ensureServer);
        return;
      }
      if (msg.k === "register-packages") {
        void this.handleRegister(msg, transport);
        return;
      }
      if (msg.k === "unregister-packages") {
        void this.handleUnregister(msg, transport);
        return;
      }
      if (msg.k === "identity") {
        this.options.onIdentity?.(msg.user);
        return;
      }
      if (msg.k === "sync-op") {
        void this.handleSyncOp(msg, transport);
        return;
      }
      if (msg.k === "db-op") {
        void this.handleDbOp(msg, transport);
        return;
      }
      if (msg.k === "inspector-op") {
        void this.handleInspectorOp(msg, transport);
        return;
      }
      if (msg.k === "sub-live") {
        void this.handleLiveSubscribe(msg, transport, liveSubs);
        return;
      }
      if (msg.k === "unsub-live") {
        liveSubs.get(msg.id)?.();
        liveSubs.delete(msg.id);
        return;
      }
      if (msg.k === "admin") {
        this.handleAdmin(msg, transport);
        return;
      }
      if (server) {
        void server.handleMessage(msg);
      } else {
        buffer.push(msg);
      }
    });

    this.clients.add(transport);
    if (this.migrationState) {
      transport.post({ k: "migration", state: this.migrationState });
    }
    if (this.options.client) {
      void ensureServer();
    }

    const dispose = () => {
      server?.stop();
      detach();
      for (const unsubscribe of liveSubs.values()) {
        unsubscribe();
      }
      liveSubs.clear();
      this.clients.delete(transport);
      this.disposers.delete(dispose);
    };
    this.disposers.add(dispose);
    return dispose;
  }

  connectPort(port: MessagePort): () => void {
    return this.connect(createPortTransport(port));
  }

  // Fan out a reactor bus event to every connected tab, fire-and-forget.
  broadcastBusEvent(eventType: number, event: unknown): void {
    for (const transport of this.clients) {
      transport.post({ k: "bus-event", eventType, event });
    }
  }

  // Tell every connected tab to reload; `workerGen` makes them adopt one fresh worker name.
  broadcastReload(reason: string, workerGen?: string): void {
    for (const transport of this.clients) {
      transport.post({ k: "reload", reason, workerGen });
    }
  }

  // Cache + fan out the worker's migration state so tabs drive the banner from it.
  setMigrationState(state: WorkerMigrationState): void {
    this.migrationState = state;
    for (const transport of this.clients) {
      transport.post({ k: "migration", state });
    }
  }

  get connectionCount(): number {
    return this.disposers.size;
  }

  private handleAdmin(message: RpcAdmin, transport: IRpcTransport): void {
    if (message.method === "restart") {
      this.options.onAdminRestart?.();
      transport.post({ k: "res", id: message.id, value: { ok: true } });
      return;
    }
    if (message.method === "clearStorage") {
      void this.handleAdminAsync(
        this.options.onAdminClearStorage,
        message,
        transport,
      );
      return;
    }
    if (message.method === "migrate") {
      void this.handleAdminAsync(
        this.options.onAdminMigrate,
        message,
        transport,
      );
      return;
    }
    const info: WorkerInspectorInfo = {
      namespace: this.options.namespace ?? "",
      ownerId: this.ownerId,
      bootedAtMs: this.bootedAtMs,
      connectedClients: this.connectionCount,
      appBuildId:
        this.baseline?.appBuildId ?? this.options.appBuildId ?? "unknown",
      rpcProtocolVersion:
        this.baseline?.rpcProtocolVersion ?? RPC_PROTOCOL_VERSION,
    };
    transport.post({ k: "res", id: message.id, value: info });
  }

  private async handleAdminAsync(
    handler: (() => Promise<void>) | undefined,
    message: RpcAdmin,
    transport: IRpcTransport,
  ): Promise<void> {
    try {
      await handler?.();
      transport.post({ k: "res", id: message.id, value: { ok: true } });
    } catch (error) {
      transport.post({ k: "err", id: message.id, error: toErrorInfo(error) });
    }
  }

  private resolveClient(construct?: unknown): Promise<IReactorClient> {
    if (!this.clientPromise) {
      const build = this.options.build;
      if (!build) {
        return Promise.reject(
          new Error("ReactorHost has no client or builder"),
        );
      }
      this.clientPromise = build(construct);
    }
    return this.clientPromise;
  }

  private async handleHello(
    message: RpcHello,
    transport: IRpcTransport,
    ensureServer: (construct?: unknown) => Promise<void>,
  ): Promise<void> {
    if (this.baseline) {
      if (!versionsCompatible(this.baseline, message.version)) {
        transport.post({
          k: "reload",
          reason: "reactor version mismatch",
          workerGen: workerGenForVersion(message.version),
        });
        transport.post({ k: "res", id: message.id, value: { ok: false } });
        return;
      }
    } else {
      this.baseline = message.version;
    }
    try {
      await ensureServer(message.construct);
      if (message.packages && message.packages.length > 0) {
        await this.options.registerPackages?.(message.packages);
      }
      transport.post({ k: "res", id: message.id, value: { ok: true } });
    } catch (error) {
      transport.post({ k: "err", id: message.id, error: toErrorInfo(error) });
    }
  }

  private async handleRegister(
    message: RpcRegisterPackages,
    transport: IRpcTransport,
  ): Promise<void> {
    try {
      await this.options.registerPackages?.(message.specs);
      transport.post({ k: "res", id: message.id, value: { ok: true } });
    } catch (error) {
      transport.post({ k: "err", id: message.id, error: toErrorInfo(error) });
    }
  }

  private async handleUnregister(
    message: RpcUnregisterPackages,
    transport: IRpcTransport,
  ): Promise<void> {
    try {
      await this.options.unregisterPackages?.(message.names);
      transport.post({ k: "res", id: message.id, value: { ok: true } });
    } catch (error) {
      transport.post({ k: "err", id: message.id, error: toErrorInfo(error) });
    }
  }

  private async handleSyncOp(
    message: RpcSyncOp,
    transport: IRpcTransport,
  ): Promise<void> {
    const handler = this.options.onSyncOp;
    if (!handler) {
      transport.post({
        k: "err",
        id: message.id,
        error: toErrorInfo(new Error("ReactorHost has no sync handler")),
      });
      return;
    }
    try {
      // Wait for the reactor to finish building so the handler's syncManager
      // exists; a tab's eager list() can arrive before the build completes.
      if (this.clientPromise) {
        await this.clientPromise;
      }
      const value = await handler(message.method, message.args);
      transport.post({ k: "res", id: message.id, value });
    } catch (error) {
      transport.post({ k: "err", id: message.id, error: toErrorInfo(error) });
    }
  }

  private async handleDbOp(
    message: RpcDbOp,
    transport: IRpcTransport,
  ): Promise<void> {
    const handler = this.options.onDbOp;
    if (!handler) {
      transport.post({
        k: "err",
        id: message.id,
        error: toErrorInfo(new Error("ReactorHost has no db handler")),
      });
      return;
    }
    try {
      if (this.clientPromise) {
        await this.clientPromise;
      }
      const value = await handler(message.method, message.args);
      transport.post({ k: "res", id: message.id, value });
    } catch (error) {
      transport.post({ k: "err", id: message.id, error: toErrorInfo(error) });
    }
  }

  private async handleInspectorOp(
    message: RpcInspectorOp,
    transport: IRpcTransport,
  ): Promise<void> {
    const handler = this.options.onInspectorOp;
    if (!handler) {
      transport.post({
        k: "err",
        id: message.id,
        error: toErrorInfo(new Error("ReactorHost has no inspector handler")),
      });
      return;
    }
    try {
      if (this.clientPromise) {
        await this.clientPromise;
      }
      const value = await handler(message.method, message.args);
      transport.post({ k: "res", id: message.id, value });
    } catch (error) {
      transport.post({ k: "err", id: message.id, error: toErrorInfo(error) });
    }
  }

  private async handleLiveSubscribe(
    message: RpcLiveSubscribe,
    transport: IRpcTransport,
    liveSubs: Map<string, () => void>,
  ): Promise<void> {
    const handler = this.options.onLiveQuery;
    if (!handler) {
      transport.post({
        k: "err",
        id: message.id,
        error: toErrorInfo(new Error("ReactorHost has no live-query handler")),
      });
      return;
    }
    const placeholder = () => undefined;
    liveSubs.set(message.id, placeholder);
    try {
      if (this.clientPromise) {
        await this.clientPromise;
      }
      const unsubscribe = await handler(
        message.sql,
        message.params,
        (results) => {
          transport.post({ k: "event-live", id: message.id, results });
        },
      );
      // unsub-live raced ahead during the await: tear down, don't leak.
      if (liveSubs.get(message.id) !== placeholder) {
        unsubscribe();
        return;
      }
      liveSubs.set(message.id, unsubscribe);
    } catch (error) {
      if (liveSubs.get(message.id) === placeholder) {
        liveSubs.delete(message.id);
      }
      transport.post({ k: "err", id: message.id, error: toErrorInfo(error) });
    }
  }
}
