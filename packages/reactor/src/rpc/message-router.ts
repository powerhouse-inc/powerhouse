import type { ClientMessage, CorrelationId, OwnerMessage } from "./protocol.js";
import { RpcCorrelator, type RpcRequestOptions } from "./rpc-correlator.js";
import type { IRpcTransport } from "./transport.js";

type OwnerKind = OwnerMessage["k"];
type RouteHandler = (message: OwnerMessage) => void;

/**
 * Owns the single transport.onMessage and dispatches each message to the one
 * consumer that owns its kind. Composes the shared RpcCorrelator (res/err) and
 * exposes request/nextId; attach/detach swap the transport for reconnect.
 */
export class MessageRouter {
  private readonly handlers = new Map<OwnerKind, RouteHandler>();
  private readonly correlator: RpcCorrelator;
  private transport: IRpcTransport | null = null;
  private detachTransport: () => void = () => {};

  constructor(prefix = "r") {
    this.correlator = new RpcCorrelator(this, prefix);
    const settle: RouteHandler = (message) =>
      this.correlator.handleMessage(message);
    this.handlers.set("res", settle);
    this.handlers.set("err", settle);
  }

  attach(transport: IRpcTransport): void {
    this.detachTransport();
    this.transport = transport;
    this.detachTransport = transport.onMessage((message) => {
      const msg = message as OwnerMessage;
      this.handlers.get(msg.k)?.(msg);
    });
  }

  detach(): void {
    this.detachTransport();
    this.detachTransport = () => {};
    this.transport = null;
  }

  post(message: ClientMessage): void {
    if (!this.transport) {
      throw new Error("MessageRouter.post called before attach");
    }
    this.transport.post(message);
  }

  /** Register the sole owner of a message kind; throws on a duplicate. */
  on<K extends OwnerKind>(
    kind: K,
    handler: (message: Extract<OwnerMessage, { k: K }>) => void,
  ): () => void {
    if (this.handlers.has(kind)) {
      throw new Error(`MessageRouter already has a handler for "${kind}"`);
    }
    const route = handler as RouteHandler;
    this.handlers.set(kind, route);
    return () => {
      if (this.handlers.get(kind) === route) {
        this.handlers.delete(kind);
      }
    };
  }

  request(
    build: (id: CorrelationId) => ClientMessage,
    options?: RpcRequestOptions,
  ): Promise<unknown> {
    return this.correlator.request(build, options);
  }

  nextId(): CorrelationId {
    return this.correlator.nextId();
  }
}
