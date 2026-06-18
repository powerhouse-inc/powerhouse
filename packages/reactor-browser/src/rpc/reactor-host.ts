import type { IReactorClient } from "@powerhousedao/reactor";
import { toErrorInfo } from "./error-info.js";
import { ReactorHostServer } from "./host-server.js";
import type {
  ClientMessage,
  RpcHello,
  RpcRegisterPackages,
  RpcUnregisterPackages,
  VersionFingerprint,
} from "./protocol.js";
import { createPortTransport, type IRpcTransport } from "./transport.js";

export type ReactorHostOptions = {
  client?: IReactorClient;
  build?: (construct: unknown) => Promise<IReactorClient>;
  registerPackages?: (specs: string[]) => Promise<void>;
  unregisterPackages?: (names: string[]) => Promise<void>;
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

export class ReactorHost {
  private readonly options: ReactorHostOptions;
  private readonly disposers = new Set<() => void>();
  private clientPromise: Promise<IReactorClient> | null = null;
  private baseline: VersionFingerprint | null = null;

  constructor(options: ReactorHostOptions) {
    this.options = options;
    if (options.client) {
      this.clientPromise = Promise.resolve(options.client);
    }
  }

  connect(transport: IRpcTransport): () => void {
    let server: ReactorHostServer | null = null;
    const buffer: ClientMessage[] = [];

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
      if (server) {
        void server.handleMessage(msg);
      } else {
        buffer.push(msg);
      }
    });

    if (this.options.client) {
      void ensureServer();
    }

    const dispose = () => {
      server?.stop();
      detach();
      this.disposers.delete(dispose);
    };
    this.disposers.add(dispose);
    return dispose;
  }

  connectPort(port: MessagePort): () => void {
    return this.connect(createPortTransport(port));
  }

  get connectionCount(): number {
    return this.disposers.size;
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
        transport.post({ k: "reload", reason: "reactor version mismatch" });
        transport.post({ k: "res", id: message.id, value: { ok: false } });
        return;
      }
    } else {
      this.baseline = message.version;
    }
    try {
      await ensureServer(message.construct);
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
}
