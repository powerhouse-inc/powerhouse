import type { IReactorClient } from "@powerhousedao/reactor";
import { ReactorHostServer } from "./host-server.js";
import { createPortTransport, type IRpcTransport } from "./transport.js";

export class ReactorHost {
  private readonly client: IReactorClient;
  private readonly servers = new Set<ReactorHostServer>();

  constructor(client: IReactorClient) {
    this.client = client;
  }

  connect(transport: IRpcTransport): () => void {
    const server = new ReactorHostServer(this.client, transport);
    server.start();
    this.servers.add(server);
    return () => {
      server.stop();
      this.servers.delete(server);
    };
  }

  connectPort(port: MessagePort): () => void {
    return this.connect(createPortTransport(port));
  }

  get connectionCount(): number {
    return this.servers.size;
  }
}
