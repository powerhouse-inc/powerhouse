import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  IReactorClient,
  IRelationalDb,
  ISyncManager,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { gql } from "graphql-tag";
import type http from "node:http";
import { vi } from "vitest";
import type { WebSocketServer } from "ws";
import { BaseSubgraph } from "../../src/graphql/base-subgraph.js";

import {
  createAuthFetchMiddleware,
  type AuthFetchMiddleware,
} from "../../src/graphql/gateway/auth-middleware.js";
import type { IAuthorizationService } from "../../src/services/authorization.service.js";
import type { IAttachmentClientProvider } from "../../src/services/authorized-attachment.service.js";
import type { IAttachmentClient } from "@powerhousedao/reactor-attachments/client";
import type {
  AdapterRouteHandle,
  FetchHandler,
  IGatewayAdapter,
  IHttpAdapter,
  WsConnection,
  WsDisposer,
  WsHandlers,
} from "../../src/graphql/gateway/types.js";
import {
  createRequireAuthFetchMiddleware,
  type RequireAuthFetchMiddleware,
} from "../../src/graphql/gateway/require-auth-middleware.js";
import { GraphQLManager } from "../../src/graphql/graphql-manager.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../../src/services/authorization.service.js";
import type {
  Context,
  ISubgraph,
  SubgraphArgs,
  SubgraphClass,
} from "../../src/graphql/types.js";
import type {
  AuthContext,
  AuthService,
} from "../../src/services/auth.service.js";

/** An ILogger whose methods are spies, for asserting on log calls. */
export function makeHarnessLogger(): ILogger {
  const logger: ILogger = {
    level: "error" as const,
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    errorHandler: vi.fn(),
    child: () => logger,
  };
  return logger;
}

/** Minimal DocumentModelModule with a DocumentDrive model - required by init(). */
export function makeDriveModule(): DocumentModelModule {
  return {
    documentModel: {
      global: {
        name: "DocumentDrive",
        id: "powerhouse/document-drive",
        specifications: [
          {
            version: 1,
            modules: [],
            // Provide a minimal state schema so buildSubgraphSchemaModule can
            // generate the DocumentDrive_DocumentDriveState type that is
            // referenced by the DocumentDrive type definition.
            state: {
              global: { schema: "type DocumentDriveState { name: String }" },
              local: { schema: "" },
            },
          },
        ],
      },
    },
  } as unknown as DocumentModelModule;
}

export function makeMockReactorClient(
  overrides: Partial<IReactorClient> = {},
): IReactorClient {
  return {
    getDocumentModelModules: vi
      .fn()
      .mockResolvedValue({ results: [makeDriveModule()] }),
    get: vi.fn().mockResolvedValue({
      header: { id: "drive-1", slug: "my-drive", meta: {} },
      state: { global: { name: "Test Drive", icon: null } },
    }),
    find: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "", limit: 100 },
    }),
    ...overrides,
  } as unknown as IReactorClient;
}

function makeMockGatewayAdapter(): IGatewayAdapter<Context> & {
  start: ReturnType<typeof vi.fn>;
  createHandler: ReturnType<typeof vi.fn>;
  createSupergraphHandler: ReturnType<typeof vi.fn>;
  updateSupergraph: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  attachWebSocket: ReturnType<typeof vi.fn>;
} {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    createHandler: vi
      .fn()
      .mockResolvedValue(() => Promise.resolve(new Response("handler ok"))),
    createSupergraphHandler: vi
      .fn()
      .mockResolvedValue(() => Promise.resolve(new Response("supergraph ok"))),
    updateSupergraph: vi.fn().mockResolvedValue(undefined),
    attachWebSocket: vi
      .fn()
      .mockReturnValue({ dispose: vi.fn() } satisfies WsDisposer),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockHttpAdapter() {
  const mounts = new Map<string, FetchHandler>();
  const handles = new Map<string, AdapterRouteHandle>();
  const disposed: AdapterRouteHandle[] = [];
  const newHandle = (): AdapterRouteHandle => {
    const handle: AdapterRouteHandle = {
      dispose: vi.fn(() => {
        disposed.push(handle);
      }),
    };
    return handle;
  };
  const adapter: IHttpAdapter = {
    setupMiddleware: vi.fn(),
    mount: vi.fn((p: string, h: FetchHandler) => {
      mounts.set(p, h);
      const handle = newHandle();
      handles.set(p, handle);
      return handle;
    }),
    getRoute: vi.fn(() => newHandle()),
    mountRawMiddleware: vi.fn(),
    mountNodeRoute: vi.fn(() => newHandle()),
    listen: vi.fn().mockResolvedValue({}),
    setupSentryErrorHandler: vi.fn(),
    handle: {},
  };
  return { adapter, mounts, handles, disposed };
}

export type HarnessOptions = {
  path?: string;
  enableDocumentModelSubgraphs?: boolean;
  reactorClient?: IReactorClient;
  logger?: ILogger;
  authorizationService?: IAuthorizationService;
  attachments?: IAttachmentClientProvider;
};

export function makeHarness(options: HarnessOptions = {}) {
  const {
    adapter: httpAdapter,
    mounts,
    handles,
    disposed,
  } = makeMockHttpAdapter();
  const gatewayAdapter = makeMockGatewayAdapter();
  const reactorClient = options.reactorClient ?? makeMockReactorClient();
  const httpServer = {} as http.Server;
  const wsServer = {
    close: vi.fn((cb?: () => void) => cb?.()),
    setMaxListeners: vi.fn(),
  } as unknown as WebSocketServer;

  const manager = new GraphQLManager({
    path: options.path ?? "/",
    httpServer,
    wsServer,
    reactorClient,
    relationalDb: {} as IRelationalDb,
    analyticsStore: {} as IAnalyticsStore,
    syncManager: {} as ISyncManager,
    logger: options.logger ?? makeHarnessLogger(),
    httpAdapter,
    gatewayAdapter,
    featureFlags: {
      enableDocumentModelSubgraphs:
        options.enableDocumentModelSubgraphs ?? false,
    },
    port: 4001,
    authorizationService:
      options.authorizationService ??
      createAuthorizationService({
        admins: [],
        defaultProtection: false,
        policy: AuthorizationPolicy.OPEN,
      }),
    attachments: options.attachments,
  });

  return {
    manager,
    httpAdapter,
    mounts,
    handles,
    disposed,
    gatewayAdapter,
    reactorClient,
    httpServer,
    wsServer,
  };
}

/** Run init() to completion, flushing the debounced updateRouter() call. */
export async function initAndFlush(
  manager: GraphQLManager,
  coreSubgraphs: SubgraphClass[] = [],
  authMiddleware?: AuthFetchMiddleware,
  requireAuthMiddleware?: RequireAuthFetchMiddleware,
) {
  const initPromise = manager.init(
    coreSubgraphs,
    authMiddleware,
    requireAuthMiddleware,
  );
  await vi.runAllTimersAsync();
  await initPromise;
}
