import type { IReactorClient } from "@powerhousedao/reactor";
import type {
  AdoptSyncPeerParams,
  RemoveSyncPeerParams,
} from "./adopt-sync-peer.js";
import {
  hostResponder,
  type IHostResponder,
  ReactorHostServer,
  SubscriptionStore,
  type ClientMessage,
  type CorrelationId,
  type ReactorIdentity,
  type RpcAdmin,
  type RpcAdoptSyncPeer,
  type RpcDbOp,
  type RpcHello,
  type RpcInspectorOp,
  type RpcLiveSubscribe,
  type RpcRegisterPackages,
  type RpcRemoveSyncPeer,
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
    msg.k === "adopt-sync-peer" ||
    msg.k === "remove-sync-peer" ||
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
  /**
   * Adopts a monitor-brokered local-sync peer: the transferred `port` and the
   * remote it describes. The host extracts the port from the (transferred, not
   * cloned) message and hands it over; the handler registers it and adds the
   * local remote. Multi-reactor W1.2.
   */
  onAdoptSyncPeer?: (
    params: AdoptSyncPeerParams,
    port: MessagePort,
  ) => Promise<void>;
  /**
   * Releases a brokered local-sync peer: removes the remote and unregisters its
   * port from this realm's transport provider. The twin of
   * {@link onAdoptSyncPeer}; see `RpcRemoveSyncPeer`.
   */
  onRemoveSyncPeer?: (params: RemoveSyncPeerParams) => Promise<void>;
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
  /**
   * Reports the capability-relevant facts of whatever construct actually won
   * the build -- not whatever a later-connecting tab's hello asked for. A
   * `ReactorHost` builds once and silently drops every construct after the
   * first, so a tab that only read its OWN hello's construct back would
   * describe a reactor that may not be the one running (multi-reactor stage 2
   * review). Awaited behind the same `awaitClientReady()` gate as an op, so a
   * caller gets the winning construct's facts, or the build's rejection, never
   * a half-built guess. The payload is opaque to `ReactorHost` -- it only
   * ferries whatever the build hook returns.
   */
  onAdminGetBuiltConfig?: () => unknown;
};

/**
 * Whether one worker may serve both fingerprints.
 *
 * `buildDigest` is compared only when BOTH sides carry one. A tab of the very
 * same build can arrive without it -- the token comes from a per-tab metadata
 * fetch that is skipped in production and can fail transiently in dev -- so an
 * absent token means "unknown", and reading it as "a different build" is what
 * made two tabs of one identical build bump the worker generation against each
 * other and run two workers over one idb namespace.
 */
function versionsCompatible(
  a: VersionFingerprint,
  b: VersionFingerprint,
): boolean {
  if (
    a.appBuildId !== b.appBuildId ||
    a.rpcProtocolVersion !== b.rpcProtocolVersion ||
    (a.featureFlags ?? "") !== (b.featureFlags ?? "")
  ) {
    return false;
  }
  if (a.buildDigest === undefined || b.buildDigest === undefined) {
    return true;
  }
  return a.buildDigest === b.buildDigest;
}

// Deterministic per version so every new-build tab converges on one fresh
// worker; the flags are in it so a flag-only change lands on a fresh one too,
// and the build digest so a dev rebuild under an unchanged version does too.
function workerGenForVersion(version: VersionFingerprint): string {
  const flags = version.featureFlags ?? "";
  const flagSuffix = flags === "" ? "" : `-${hashFlags(flags)}`;
  const digestSuffix =
    version.buildDigest === undefined ? "" : `-${version.buildDigest}`;
  return `v${version.rpcProtocolVersion}-${version.appBuildId}${digestSuffix}${flagSuffix}`;
}

/** Names what differs, so a reload is diagnosable from the tab's console. */
function mismatchReason(
  baseline: VersionFingerprint,
  incoming: VersionFingerprint,
): string {
  if ((baseline.featureFlags ?? "") !== (incoming.featureFlags ?? "")) {
    return `reactor enforcement flags changed (worker: ${
      baseline.featureFlags || "none"
    }, tab: ${incoming.featureFlags || "none"})`;
  }
  return "reactor version mismatch";
}

// Worker names end up in devtools and IndexedDB keys, so the flag set is
// folded to a short stable token rather than spelled out.
function hashFlags(flags: string): string {
  let hash = 0;
  for (let i = 0; i < flags.length; i++) {
    hash = (hash * 31 + flags.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
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
        void this.handleHello(msg, reply, ensureServer, drainBuffer);
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
      if (msg.k === "adopt-sync-peer") {
        void this.handleAdoptSyncPeer(msg, reply);
        return;
      }
      if (msg.k === "remove-sync-peer") {
        void this.handleRemoveSyncPeer(msg, reply);
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
    if (message.method === "builtConfig") {
      void this.handleAdminBuiltConfig(message, reply);
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

  /**
   * Answers "builtConfig" only once the client is resolved, so the reply
   * describes the construct that WON the build rather than racing it.
   */
  private async handleAdminBuiltConfig(
    message: RpcAdmin,
    reply: IHostResponder,
  ): Promise<void> {
    await reply.run(
      message.id,
      async () => {
        await this.awaitClientReady();
        return this.options.onAdminGetBuiltConfig?.() ?? null;
      },
      (value) => value,
    );
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
      this.buildFailure = null;
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

  /**
   * Admits a tab, or sends every tab away when its build disagrees with the
   * one this worker was adopted for.
   *
   * Baseline adoption: the FIRST hello adopts the baseline, and a later hello
   * that disagrees with it REPLACES it -- the newest hello wins. The newest
   * hello is the newest build, because its page code is whatever the server
   * just served, and a worker has no other way to order two opaque build ids.
   *
   * The reload goes to EVERY connected tab, not only the one that disagreed.
   * The stale tabs are the ones holding this worker alive: told nothing, they
   * keep it, while the new tab bumps its generation and spawns a second worker
   * over the same idb namespace. All of them reload onto the one generation the
   * incoming fingerprint names, and because a reload re-fetches the page, a tab
   * that was on an older build comes back on the newest one and agrees. If it
   * comes back disagreeing again, that hello is itself the newest and the same
   * rule runs once more, so the naming converges rather than oscillating.
   */
  private async handleHello(
    message: RpcHello,
    reply: IHostResponder,
    ensureServer: (construct?: unknown) => Promise<void>,
    drainBuffer: () => Promise<void>,
  ): Promise<void> {
    if (this.baseline) {
      if (!versionsCompatible(this.baseline, message.version)) {
        const reason = mismatchReason(this.baseline, message.version);
        this.baseline = message.version;
        this.broadcastReload(reason, workerGenForVersion(message.version));
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

  /**
   * Adopts a transferred local-sync port, closing it on every failure.
   *
   * The port was MOVED into this realm by the time this runs, so the sender can
   * no longer close it: dropping it on an error path would leak a live
   * MessagePort and leave the other end waiting on a reader that will never
   * exist. Every exit that is not success therefore closes it before replying.
   */
  private async handleAdoptSyncPeer(
    message: RpcAdoptSyncPeer,
    reply: IHostResponder,
  ): Promise<void> {
    const handler = this.options.onAdoptSyncPeer;
    if (!handler) {
      message.port.close();
      reply.errForKind(
        message,
        new Error("ReactorHost has no adopt-sync-peer handler"),
      );
      return;
    }
    await reply.run(message.id, async () => {
      try {
        await this.awaitClientReady();
      } catch (error) {
        message.port.close();
        throw error;
      }
      try {
        await handler(
          {
            peerId: message.peerId,
            channelName: message.channelName,
            collectionIdKey: message.collectionIdKey,
            remoteName: message.remoteName,
            filter: message.filter,
          },
          message.port,
        );
      } catch (error) {
        message.port.close();
        throw error;
      }
    });
  }

  private async handleRemoveSyncPeer(
    message: RpcRemoveSyncPeer,
    reply: IHostResponder,
  ): Promise<void> {
    const handler = this.options.onRemoveSyncPeer;
    if (!this.requireHandler(handler, message, reply, "remove-sync-peer")) {
      return;
    }
    await reply.run(message.id, async () => {
      await this.awaitClientReady();
      await handler({
        peerId: message.peerId,
        channelName: message.channelName,
        remoteName: message.remoteName,
      });
    });
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
