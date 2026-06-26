import type { IReactorClient } from "@powerhousedao/reactor";
import { hostResponder, type IHostResponder } from "./host-reply.js";
import { ReactorHostServer } from "./host-server.js";
import { SubscriptionStore } from "./subscription.js";
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
import { RPC_PROTOCOL_VERSION } from "./protocol.js";
import { createPortTransport, type IRpcTransport } from "./transport.js";

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
    let ready = false;
    const buffer: ClientMessage[] = [];
    const liveSubs = new SubscriptionStore();
    const reply = hostResponder(transport);

    const ensureServer = async (construct?: unknown): Promise<void> => {
      if (server) {
        return;
      }
      const client = await this.resolveClient(construct);
      server = new ReactorHostServer(client, transport);
    };

    // Drain only after init (server + package registration) completes, in order.
    // Messages arriving mid-drain stay buffered (ready flips last) so order holds.
    const drainBuffer = async (): Promise<void> => {
      while (buffer.length > 0) {
        const message = buffer.shift()!;
        await server!.handleMessage(message);
      }
      ready = true;
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
        // Route the rejection to the kind's owner (sub -> sub-err, etc.).
        reply.errForKind(msg, new Error("migration in progress"));
        return;
      }
      if (msg.k === "hello") {
        void this.handleHello(msg, transport, reply, ensureServer, drainBuffer);
        return;
      }
      if (msg.k === "register-packages") {
        void this.handleRegister(msg, reply);
        return;
      }
      if (msg.k === "unregister-packages") {
        void this.handleUnregister(msg, reply);
        return;
      }
      if (msg.k === "identity") {
        this.options.onIdentity?.(msg.user);
        return;
      }
      if (msg.k === "sync-op") {
        void this.handleOp(msg, this.options.onSyncOp, "sync", reply);
        return;
      }
      if (msg.k === "db-op") {
        void this.handleOp(msg, this.options.onDbOp, "db", reply);
        return;
      }
      if (msg.k === "inspector-op") {
        void this.handleOp(msg, this.options.onInspectorOp, "inspector", reply);
        return;
      }
      if (msg.k === "sub-live") {
        void this.handleLiveSubscribe(msg, transport, reply, liveSubs);
        return;
      }
      if (msg.k === "unsub-live") {
        liveSubs.end(msg.id);
        return;
      }
      if (msg.k === "admin") {
        this.handleAdmin(msg, reply);
        return;
      }
      if (ready && server) {
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
      void ensureServer()
        .then(drainBuffer)
        .catch((error) => {
          console.error("ReactorHost buffer drain failed", error);
        });
    }

    const dispose = () => {
      server?.stop();
      detach();
      liveSubs.drain();
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

  private handleAdmin(message: RpcAdmin, reply: IHostResponder): void {
    if (message.method === "restart") {
      this.options.onAdminRestart?.();
      reply.ok(message.id);
      return;
    }
    if (message.method === "clearStorage") {
      void this.handleAdminAsync(
        this.options.onAdminClearStorage,
        message,
        reply,
      );
      return;
    }
    if (message.method === "migrate") {
      void this.handleAdminAsync(this.options.onAdminMigrate, message, reply);
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
    reply.ok(message.id, info);
  }

  private async handleAdminAsync(
    handler: (() => Promise<void>) | undefined,
    message: RpcAdmin,
    reply: IHostResponder,
  ): Promise<void> {
    await reply.run(message.id, async () => {
      await handler?.();
    });
  }

  private resolveClient(construct?: unknown): Promise<IReactorClient> {
    if (!this.clientPromise) {
      const build = this.options.build;
      if (!build) {
        return Promise.reject(
          new Error("ReactorHost has no client or builder"),
        );
      }
      const pending = build(construct);
      this.clientPromise = pending;
      pending.catch(() => {
        if (this.clientPromise === pending) {
          this.clientPromise = null;
        }
      });
    }
    return this.clientPromise;
  }

  private async awaitClientReady(): Promise<void> {
    if (this.clientPromise) {
      await this.clientPromise;
    }
  }

  private requireHandler<T>(
    handler: T | undefined,
    message: ClientMessage,
    reply: IHostResponder,
    label: string,
  ): handler is T {
    if (handler) {
      return true;
    }
    reply.errForKind(message, new Error(`ReactorHost has no ${label} handler`));
    return false;
  }

  private async handleHello(
    message: RpcHello,
    transport: IRpcTransport,
    reply: IHostResponder,
    ensureServer: (construct?: unknown) => Promise<void>,
    drainBuffer: () => Promise<void>,
  ): Promise<void> {
    if (this.baseline) {
      if (!versionsCompatible(this.baseline, message.version)) {
        transport.post({
          k: "reload",
          reason: "reactor version mismatch",
          workerGen: workerGenForVersion(message.version),
        });
        reply.ok(message.id, { ok: false });
        return;
      }
    } else {
      this.baseline = message.version;
    }
    await reply.run(message.id, async () => {
      await ensureServer(message.construct);
      if (message.packages && message.packages.length > 0) {
        await this.options.registerPackages?.(message.packages);
      }
      // Packages are registered; replay buffered data messages in order.
      await drainBuffer();
    });
  }

  private async handleRegister(
    message: RpcRegisterPackages,
    reply: IHostResponder,
  ): Promise<void> {
    await reply.run(message.id, async () => {
      await this.options.registerPackages?.(message.specs);
    });
  }

  private async handleUnregister(
    message: RpcUnregisterPackages,
    reply: IHostResponder,
  ): Promise<void> {
    await reply.run(message.id, async () => {
      await this.options.unregisterPackages?.(message.names);
    });
  }

  private async handleOp(
    message: RpcSyncOp | RpcDbOp | RpcInspectorOp,
    handler:
      | ((method: string, args: unknown[]) => Promise<unknown>)
      | undefined,
    label: string,
    reply: IHostResponder,
  ): Promise<void> {
    if (!this.requireHandler(handler, message, reply, label)) {
      return;
    }
    await reply.run(
      message.id,
      async () => {
        await this.awaitClientReady();
        return handler(message.method, message.args);
      },
      (value) => value,
    );
  }

  private async handleLiveSubscribe(
    message: RpcLiveSubscribe,
    transport: IRpcTransport,
    reply: IHostResponder,
    liveSubs: SubscriptionStore,
  ): Promise<void> {
    const handler = this.options.onLiveQuery;
    if (!this.requireHandler(handler, message, reply, "live-query")) {
      return;
    }
    const placeholder = () => undefined;
    liveSubs.set(message.id, placeholder);
    try {
      await this.awaitClientReady();
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
      reply.errForKind(message, error);
    }
  }
}
