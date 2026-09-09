import type {
  ProjectionInitMessage,
  ProjectionParentMessage,
  ProjectionWorkerMessage,
} from "../../src/projection/protocol.js";
import type {
  IProjectionTransport,
  ProjectionTransportEvent,
  ProjectionTransportEventMap,
  ProjectionTransportListener,
} from "../../src/projection/transport.js";

type ListenerBag = {
  [E in ProjectionTransportEvent]: Set<ProjectionTransportListener<E>>;
};

export type FakeProjectionTransportOptions = {
  /**
   * Reply to the `init` message with `ready` as soon as it arrives, so
   * `ProjectionShardManager.startup()` resolves. Set false to exercise the
   * init-timeout path.
   */
  autoReady?: boolean;
};

/**
 * In-memory stand-in for a projection worker thread. Records everything the
 * host posts and lets a test push worker messages back by hand, so the
 * host-side {@link ProjectionShardManager} can be unit tested without
 * spawning a worker or touching Postgres.
 */
export class FakeProjectionTransport implements IProjectionTransport {
  readonly sent: ProjectionParentMessage[] = [];
  terminateCalls = 0;

  private readonly listeners: ListenerBag = {
    message: new Set(),
    error: new Set(),
    exit: new Set(),
  };
  private readonly autoReady: boolean;

  constructor(
    readonly shardIndex: number,
    readonly shardId: string,
    options: FakeProjectionTransportOptions = {},
  ) {
    this.autoReady = options.autoReady ?? true;
  }

  /** Messages of one type, in the order the host posted them. */
  sentOfType<T extends ProjectionParentMessage["type"]>(
    type: T,
  ): Extract<ProjectionParentMessage, { type: T }>[] {
    return this.sent.filter((msg) => msg.type === type) as Extract<
      ProjectionParentMessage,
      { type: T }
    >[];
  }

  postMessage(message: ProjectionParentMessage): void {
    this.sent.push(message);
    if (message.type === "init" && this.autoReady) {
      this.sendReady(message);
    }
  }

  on<E extends ProjectionTransportEvent>(
    event: E,
    listener: ProjectionTransportListener<E>,
  ): void {
    (this.listeners[event] as Set<ProjectionTransportListener<E>>).add(
      listener,
    );
  }

  off<E extends ProjectionTransportEvent>(
    event: E,
    listener: ProjectionTransportListener<E>,
  ): void {
    (this.listeners[event] as Set<ProjectionTransportListener<E>>).delete(
      listener,
    );
  }

  terminate(): Promise<number> {
    this.terminateCalls++;
    return Promise.resolve(0);
  }

  /** Pushes a worker message to the host as if the worker had posted it. */
  emit<E extends ProjectionTransportEvent>(
    event: E,
    payload: ProjectionTransportEventMap[E],
  ): void {
    for (const listener of [
      ...(this.listeners[event] as Set<ProjectionTransportListener<E>>),
    ]) {
      listener(payload);
    }
  }

  /** Convenience wrapper for the common `message` case. */
  send(message: ProjectionWorkerMessage): void {
    this.emit("message", message);
  }

  private sendReady(init: ProjectionInitMessage): void {
    this.send({
      type: "ready",
      correlationId: init.correlationId,
      shardId: init.shardId,
    });
  }
}

/**
 * Factory for a fixed set of fake transports, one per shard, kept so the test
 * can drive each shard afterwards.
 */
export function createFakeProjectionTransports(
  options: FakeProjectionTransportOptions = {},
): {
  transports: FakeProjectionTransport[];
  factory: (shardIndex: number, shardId: string) => IProjectionTransport;
} {
  const transports: FakeProjectionTransport[] = [];
  return {
    transports,
    factory: (shardIndex: number, shardId: string) => {
      const transport = new FakeProjectionTransport(
        shardIndex,
        shardId,
        options,
      );
      transports.push(transport);
      return transport;
    },
  };
}
