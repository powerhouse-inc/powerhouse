import type {
  DocumentChangeEvent,
  IReactorClient,
  SearchFilter,
  ViewFilter,
} from "@powerhousedao/reactor";
import { toErrorInfo } from "./error-info.js";
import type {
  ClientMessage,
  RpcNextPage,
  RpcRequest,
  RpcSubscribe,
} from "./protocol.js";
import type { IRpcTransport } from "./transport.js";

type AnyMethod = (...args: unknown[]) => unknown;
type NextPage = () => Promise<unknown>;

export class ReactorHostServer {
  private readonly client: IReactorClient;
  private readonly transport: IRpcTransport;
  private readonly aborters = new Map<string, AbortController>();
  private readonly subscriptions = new Map<string, () => void>();
  private readonly pages = new Map<string, NextPage>();
  private pageCounter = 0;
  private detach: () => void = () => {};

  constructor(client: IReactorClient, transport: IRpcTransport) {
    this.client = client;
    this.transport = transport;
  }

  start(): void {
    this.detach = this.transport.onMessage((message) => {
      void this.handleMessage(message as ClientMessage);
    });
  }

  stop(): void {
    this.detach();
    for (const unsubscribe of this.subscriptions.values()) {
      unsubscribe();
    }
    this.subscriptions.clear();
    this.aborters.clear();
    this.pages.clear();
  }

  async handleMessage(message: ClientMessage): Promise<void> {
    try {
      switch (message.k) {
        case "req":
          await this.handleRequest(message);
          return;
        case "page":
          await this.handlePage(message);
          return;
        case "abort":
          this.aborters.get(message.targetId)?.abort();
          return;
        case "sub":
          this.handleSubscribe(message);
          return;
        case "unsub":
          this.subscriptions.get(message.id)?.();
          this.subscriptions.delete(message.id);
          return;
      }
    } catch (error) {
      if ("id" in message) {
        this.transport.post({
          k: "err",
          id: message.id,
          error: toErrorInfo(error),
        });
      }
    }
  }

  private async handleRequest(message: RpcRequest): Promise<void> {
    let args = message.args;
    let controller: AbortController | undefined;
    if (message.abortAt !== undefined) {
      controller = new AbortController();
      this.aborters.set(message.id, controller);
      args = message.args.slice();
      args[message.abortAt] = controller.signal;
    }
    try {
      const method = this.resolveMethod(message.method);
      const value = await method(...args);
      this.transport.post({
        k: "res",
        id: message.id,
        value: this.prepareResult(value),
      });
    } catch (error) {
      this.transport.post({
        k: "err",
        id: message.id,
        error: toErrorInfo(error),
      });
    } finally {
      if (controller) {
        this.aborters.delete(message.id);
      }
    }
  }

  private async handlePage(message: RpcNextPage): Promise<void> {
    const next = this.pages.get(message.token);
    this.pages.delete(message.token);
    if (!next) {
      this.transport.post({
        k: "err",
        id: message.id,
        error: toErrorInfo(
          new Error("Paged cursor already consumed or expired"),
        ),
      });
      return;
    }
    try {
      const value = await next();
      this.transport.post({
        k: "res",
        id: message.id,
        value: this.prepareResult(value),
      });
    } catch (error) {
      this.transport.post({
        k: "err",
        id: message.id,
        error: toErrorInfo(error),
      });
    }
  }

  private handleSubscribe(message: RpcSubscribe): void {
    const unsubscribe = this.client.subscribe(
      message.search as SearchFilter,
      (change: DocumentChangeEvent) =>
        this.transport.post({ k: "event", id: message.id, change }),
      message.view as ViewFilter | undefined,
    );
    this.subscriptions.set(message.id, unsubscribe);
  }

  private prepareResult(value: unknown): unknown {
    if (
      value !== null &&
      typeof value === "object" &&
      typeof (value as { next?: unknown }).next === "function"
    ) {
      const token = `p${++this.pageCounter}`;
      this.pages.set(token, (value as { next: NextPage }).next);
      const rest: Record<string, unknown> = {
        ...(value as Record<string, unknown>),
      };
      delete rest.next;
      rest.nextToken = token;
      return rest;
    }
    return value;
  }

  private resolveMethod(path: string): AnyMethod {
    if (path.startsWith("drives.")) {
      const name = path.slice("drives.".length);
      const drives = this.client.drives as unknown as Record<string, AnyMethod>;
      const fn = drives[name];
      if (typeof fn !== "function") {
        throw new Error(`Unknown drive method: ${name}`);
      }
      return fn.bind(this.client.drives);
    }
    const client = this.client as unknown as Record<string, AnyMethod>;
    const fn = client[path];
    if (typeof fn !== "function") {
      throw new Error(`Unknown reactor method: ${path}`);
    }
    return fn.bind(this.client);
  }
}
