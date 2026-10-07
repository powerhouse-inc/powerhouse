import type { IReactorClient } from "@powerhousedao/reactor";
import {
  hostResponder,
  type IHostResponder,
  ReactorHostServer,
  SubscriptionStore,
  type ClientMessage,
  type CorrelationId,
  type ReactorIdentity,
  type RpcAdmin,
  type RpcDbOp,
  type RpcHello,
  type RpcInspectorOp,
  type RpcLiveSubscribe,
  type RpcRegisterPackages,
  type RpcSyncOp,
  type RpcUnregisterPackages,
  type VersionFingerprint,
  type WorkerInspectorInfo,
  type WorkerMigrationState,
  type WorkerPackageSource,
  RPC_PROTOCOL_VERSION,
  createPortTransport,
  type IRpcTransport,
} from "@powerhousedao/reactor/rpc";

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
  registerPackages?: (
    specs: string[],
    sources?: WorkerPackageSource[],
  ) => Promise<void>;
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
  /** Stops the reactor and releases its stores once the worker is retired. */
  onRetire?: (reason: string) => Promise<void>;
};

function versionsCompatible(
  a: VersionFingerprint,
  b: VersionFingerprint,
): boolean {
  return (
    a.appBuildId === b.appBuildId &&
    a.rpcProtocolVersion === b.rpcProtocolVersion &&
    (a.featureFlags ?? "") === (b.featureFlags ?? "")
  );
}

// Deterministic per version so every new-build tab converges on one fresh
// worker; the flags are in it so a flag-only change lands on a fresh one too.
function workerGenForVersion(version: VersionFingerprint): string {
  const flags = version.featureFlags ?? "";
  const suffix = flags === "" ? "" : `-${hashFlags(flags)}`;
  return `v${version.rpcProtocolVersion}-${version.appBuildId}${suffix}`;
}

const VERSION_MISMATCH = "reactor version mismatch";
const FLAGS_CHANGED = "reactor enforcement flags changed";

/** Whether a reload reason comes from a build fingerprint mismatch. */
export function isFingerprintMismatchReload(reason: string): boolean {
  return reason === VERSION_MISMATCH || reason.startsWith(FLAGS_CHANGED);
}

/** Names what differs, so a reload is diagnosable from the tab's console. */
function mismatchReason(
  baseline: VersionFingerprint,
  incoming: VersionFingerprint,
): string {
  if ((baseline.featureFlags ?? "") !== (incoming.featureFlags ?? "")) {
    return `${FLAGS_CHANGED} (worker: ${
      baseline.featureFlags || "none"
    }, tab: ${incoming.featureFlags || "none"})`;
  }
  return VERSION_MISMATCH;
}

// Worker names end up in devtools and IndexedDB keys, so the flag set is
// reduced to a short stable token rather than spelled out.
function hashFlags(flags: string): string {
  let hash = 0;
  for (let i = 0; i < flags.length; i++) {
    hash = (hash * 31 + flags.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export const RETIRED_WORKER_RELOAD_REASON = "worker retired";

function retiredError(): Error {
  return new Error("This worker was retired; reloading into the current one");
}

export class ReactorHost {
  private readonly options: ReactorHostOptions;
  private readonly disposers = new Set<() => void>();
  private readonly clients = new Set<IRpcTransport>();
  private clientPromise: Promise<IReactorClient> | null = null;
  // Ops after a failed build get its error until a hello rebuilds.
  private buildFailure: { error: unknown } | null = null;
  private baseline: VersionFingerprint | null = null;
  private readonly ownerId: string;
  private readonly bootedAtMs: number;
  private migrationState: WorkerMigrationState | null = null;
  private retirement: { reason: string; workerGen: string } | null = null;

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
      // No reload here: a tab past its poisoned-store budget stays put on purpose.
      if (this.retirement && isDataMessage(msg)) {
        reply.errForKind(msg, retiredError());
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
        this.handleAdmin(msg, reply, transport);
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
    if (this.retirement) {
      transport.post({ k: "reload", ...this.retirement });
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

  // A reload this worker never recovers from; tabs that connect later get it too.
  retireAndReload(reason: string, workerGen: string): void {
    if (this.retirement) {
      return;
    }
    this.retirement = { reason, workerGen };
    this.broadcastReload(reason, workerGen);
    this.stopRetired(reason);
  }

  private stopRetired(reason: string): void {
    this.options.onRetire?.(reason).catch((error: unknown) => {
      console.error("ReactorHost retirement cleanup failed", error);
    });
  }

  // Cache + fan out the worker's migration state so tabs drive the banner from it.
  setMigrationState(state: WorkerMigrationState): void {
    this.migrationState = state;
    for (const transport of this.clients) {
      transport.post({ k: "migration", state });
    }
  }

  get retired(): boolean {
    return this.retirement !== null;
  }

  get connectionCount(): number {
    return this.disposers.size;
  }

  private handleAdmin(
    message: RpcAdmin,
    reply: IHostResponder,
    transport: IRpcTransport,
  ): void {
    // A retired worker no longer owns the store: send the tab to the one that does.
    if (this.retirement && message.method !== "info") {
      transport.post({
        k: "reload",
        reason: RETIRED_WORKER_RELOAD_REASON,
        workerGen: this.retirement.workerGen,
      });
      reply.err(message.id, retiredError());
      return;
    }
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
      featureFlags: this.baseline?.featureFlags ?? "",
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
    // A retired worker's client may sit on stopped stores.
    if (this.retirement) {
      return Promise.reject(retiredError());
    }
    if (!this.clientPromise) {
      const build = this.options.build;
      if (!build) {
        return Promise.reject(
          new Error("ReactorHost has no client or builder"),
        );
      }
      const pending = build(construct);
      this.clientPromise = pending;
      this.buildFailure = null;
      // A build outliving the retirement holds stores onRetire left to it.
      void pending.then(
        () => {
          if (this.retirement) this.stopRetired(this.retirement.reason);
        },
        () => undefined,
      );
      pending.catch((error: unknown) => {
        if (this.clientPromise === pending) {
          this.clientPromise = null;
          this.buildFailure = { error };
        }
      });
    }
    return this.clientPromise;
  }

  private async awaitClientReady(): Promise<void> {
    if (this.clientPromise) {
      await this.clientPromise;
      return;
    }
    if (this.buildFailure) {
      throw this.buildFailure.error;
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

  // A mismatch retires the worker for good: every tab reloads onto one gen.
  private async handleHello(
    message: RpcHello,
    transport: IRpcTransport,
    reply: IHostResponder,
    ensureServer: (construct?: unknown) => Promise<void>,
    drainBuffer: () => Promise<void>,
  ): Promise<void> {
    if (this.baseline) {
      if (!versionsCompatible(this.baseline, message.version)) {
        // Salted per instance: the bare gen can be this worker's own name.
        this.retireAndReload(
          mismatchReason(this.baseline, message.version),
          `${workerGenForVersion(message.version)}-${this.ownerId.slice(0, 8)}`,
        );
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
      await this.options.registerPackages?.(message.specs, message.sources);
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
