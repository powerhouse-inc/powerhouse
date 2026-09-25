import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  InProcessReactorClientModule,
  IRelationalDb,
  ISyncManager,
} from "@powerhousedao/reactor";
import {
  driveDocumentModelModule,
  setDriveName,
} from "@powerhousedao/shared/document-drive";
import type { ILogger } from "document-model";
import type http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebSocketServer } from "ws";
import { ExpressHttpAdapter } from "../src/graphql/gateway/adapter-http-express.js";
import { createAuthFetchMiddleware } from "../src/graphql/gateway/auth-middleware.js";
import type { IGatewayAdapter } from "../src/graphql/gateway/types.js";
import { GraphQLManager } from "../src/graphql/graphql-manager.js";
import type { Context } from "../src/graphql/types.js";
import type { AuthService } from "../src/services/auth.service.js";
import {
  buildReadGateReactor,
  createFixture,
  openAuthorization,
  OUTSIDER,
  police,
  READER,
} from "./utils/read-gate-fixture.js";

const silentLogger: ILogger = {
  level: "error" as const,
  verbose: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  errorHandler: vi.fn(),
  child: () => silentLogger,
};

// The bearer is the caller's address.
const authService = {
  authenticateRequest: (request: globalThis.Request) => {
    const token = request.headers.get("authorization")?.split(" ")[1];
    return Promise.resolve({
      user: token
        ? { address: token, chainId: 1, networkId: "eip155", appKey: "" }
        : undefined,
      admins: [],
      auth_enabled: true,
    });
  },
} as unknown as AuthService;

const gatewayAdapter = {
  start: vi.fn().mockResolvedValue(undefined),
  createHandler: vi.fn().mockResolvedValue(() => new Response("ok")),
  createSupergraphHandler: vi.fn().mockResolvedValue(() => new Response("ok")),
  updateSupergraph: vi.fn().mockResolvedValue(undefined),
  attachWebSocket: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  stop: vi.fn().mockResolvedValue(undefined),
} as unknown as IGatewayAdapter<Context>;

describe("GET /d/:drive reads the drive as the caller", () => {
  let module: InProcessReactorClientModule | undefined;
  let server: http.Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) =>
      server ? server.close(() => resolve()) : resolve(),
    );
    server = undefined;
    module?.reactor.kill();
    module = undefined;
  });

  async function start() {
    module = await buildReadGateReactor();
    const drive = await createFixture(module.client, "ri-drive", {
      source: driveDocumentModelModule,
    });
    await module.client.execute(drive, "main", [
      setDriveName({ name: "classified" }),
    ]);
    await police(module.client, drive);

    const httpAdapter = new ExpressHttpAdapter();
    server = (await httpAdapter.listen(0)) as http.Server;
    const { port } = server.address() as { port: number };
    const manager = new GraphQLManager(
      "/",
      server,
      {
        close: vi.fn((cb?: () => void) => cb?.()),
        setMaxListeners: vi.fn(),
      } as unknown as WebSocketServer,
      module.client,
      {} as IRelationalDb,
      {} as IAnalyticsStore,
      {} as ISyncManager,
      silentLogger,
      httpAdapter,
      gatewayAdapter,
      undefined,
      undefined,
      { enableDocumentModelSubgraphs: false },
      port,
      openAuthorization,
    );
    await manager.init([], createAuthFetchMiddleware(authService), undefined);

    return async (bearer?: string) => {
      const res = await fetch(`http://127.0.0.1:${port}/d/${drive}`, {
        headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      });
      expect(res.status).toBe(200);
      return (await res.json()) as { name: string; graphqlEndpoint: string };
    };
  }

  it("serves the drive's domain name only to a caller who may read it", async () => {
    const info = await start();

    const anonymous = await info();
    const outsider = await info(OUTSIDER);
    const reader = await info(READER);

    expect(anonymous.name).toBe("ri-drive");
    expect(outsider.name).toBe("ri-drive");
    expect(reader.name).toBe("classified");
    expect(anonymous.graphqlEndpoint).toContain("/graphql/r");
  });
});
