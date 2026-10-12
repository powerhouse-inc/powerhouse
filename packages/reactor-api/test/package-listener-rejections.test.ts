import type {
  IProcessorManager,
  IReactorClient,
  ProcessorFactory,
} from "@powerhousedao/reactor";
import type { ILogger } from "document-model";
import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocketServer } from "ws";
import {
  GraphQLManager,
  type GraphQLManagerOptions,
} from "../src/graphql/graphql-manager.js";
import type { PackageManager } from "../src/packages/package-manager.js";
import { setupEventListeners } from "../src/server.js";
import type {
  IProcessorHostModule,
  Processor,
  ProcessorFactoryBuilder,
} from "../src/types.js";

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

function makePackageManager() {
  const handlers: {
    documentModels?: (models: Record<string, unknown[]>) => void;
    processors?: (processors: Map<string, Processor>) => void;
  } = {};
  const pkgManager = {
    onDocumentModelsChange: vi.fn(
      (handler: (models: Record<string, unknown[]>) => void) => {
        handlers.documentModels = handler;
      },
    ),
    onSubgraphsChange: vi.fn(),
    onProcessorsChange: vi.fn(
      (handler: (processors: Map<string, Processor>) => void) => {
        handlers.processors = handler;
      },
    ),
  } as unknown as PackageManager;
  return { pkgManager, handlers };
}

function makeGraphQLManager(reactorClient: IReactorClient): GraphQLManager {
  return new GraphQLManager({
    path: "/",
    httpServer: {} as http.Server,
    wsServer: { setMaxListeners: vi.fn() } as unknown as WebSocketServer,
    reactorClient,
    logger: silentLogger,
    featureFlags: { enableDocumentModelSubgraphs: true },
  } as unknown as GraphQLManagerOptions);
}

function makeProcessorManager() {
  return {
    registerFactory: vi.fn().mockResolvedValue(undefined),
    unregisterFactory: vi.fn().mockResolvedValue(undefined),
  } as unknown as IProcessorManager & {
    registerFactory: ReturnType<typeof vi.fn>;
    unregisterFactory: ReturnType<typeof vi.fn>;
  };
}

const moduleFor = () => ({}) as IProcessorHostModule;

// unhandledRejection only fires after the microtask queue drains.
const nextMacrotask = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

describe("package listeners do not leak rejections", () => {
  const unhandled: unknown[] = [];
  const capture = (reason: unknown) => {
    unhandled.push(reason);
  };

  beforeEach(() => {
    unhandled.length = 0;
    process.on("unhandledRejection", capture);
  });

  afterEach(() => {
    process.off("unhandledRejection", capture);
  });

  it("catches a failed regeneration after a document model change", async () => {
    const failure = new Error("getDocumentModelModules failed");
    const reactorClient = {
      getDocumentModelModules: vi.fn().mockRejectedValue(failure),
    } as unknown as IReactorClient;
    const graphqlManager = makeGraphQLManager(reactorClient);
    const { pkgManager, handlers } = makePackageManager();

    setupEventListeners(
      pkgManager,
      graphqlManager,
      makeProcessorManager(),
      moduleFor,
    );
    handlers.documentModels!({});
    await nextMacrotask();

    expect(reactorClient.getDocumentModelModules).toHaveBeenCalledOnce();
    expect(unhandled).toEqual([]);
  });

  it("registers the remaining packages when a processor factory builder throws", async () => {
    const processorManager = makeProcessorManager();
    const { pkgManager, handlers } = makePackageManager();
    const throwing = (() => {
      throw new Error("builder failed");
    }) as unknown as ProcessorFactoryBuilder;
    const healthyFactory: ProcessorFactory = () => Promise.resolve([]);
    const healthy = (() =>
      healthyFactory) as unknown as ProcessorFactoryBuilder;

    setupEventListeners(
      pkgManager,
      makeGraphQLManager({} as IReactorClient),
      processorManager,
      moduleFor,
    );
    handlers.processors!(
      new Map<string, Processor>([
        ["broken-pkg", [throwing]],
        ["healthy-pkg", [healthy]],
      ]),
    );
    await nextMacrotask();

    expect(processorManager.registerFactory).toHaveBeenCalledOnce();
    expect(processorManager.registerFactory).toHaveBeenCalledWith(
      "healthy-pkg",
      expect.any(Function),
    );
    expect(unhandled).toEqual([]);
  });

  it("keeps going when the processor manager rejects", async () => {
    const processorManager = makeProcessorManager();
    processorManager.unregisterFactory.mockRejectedValue(
      new Error("unregister failed"),
    );
    processorManager.registerFactory.mockRejectedValueOnce(
      new Error("register failed"),
    );
    const { pkgManager, handlers } = makePackageManager();
    const healthyFactory: ProcessorFactory = () => Promise.resolve([]);
    const healthy = (() =>
      healthyFactory) as unknown as ProcessorFactoryBuilder;

    setupEventListeners(
      pkgManager,
      makeGraphQLManager({} as IReactorClient),
      processorManager,
      moduleFor,
    );
    handlers.processors!(
      new Map<string, Processor>([
        ["first-pkg", [healthy]],
        ["second-pkg", [healthy]],
      ]),
    );
    await nextMacrotask();

    expect(processorManager.registerFactory).toHaveBeenCalledTimes(2);
    expect(unhandled).toEqual([]);
  });
});
