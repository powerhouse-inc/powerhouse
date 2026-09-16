// The seam between the reactor and the workflow engine: what the host hands
// over, what start/stop do, and what happens when the engine is not there.
import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import { BaseSubgraph } from "../../src/graphql/base-subgraph.js";
import { composeWorkflowRuntime } from "../../src/workflow/host.js";
import { resolveWorkflowsEnabled } from "../../src/workflow/flag.js";
import { AuthorizationPolicy } from "../../src/services/authorization.service.js";

const PACKAGE_NAME = "@powerhousedao/workflow";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
  child: vi.fn(),
} as unknown as ILogger;

const authorizationService = {
  config: { policy: AuthorizationPolicy.OPEN, admins: [] },
  isSupremeAdmin: () => true,
  canRead: () => Promise.resolve(true),
} as never;

function fakeEngine() {
  const runtime = {
    registerWebhookEndpoint: vi.fn(() => Promise.resolve()),
    startTriggerSupervisor: vi.fn(),
    shutdown: vi.fn(),
  };
  const factory = vi.fn();
  return {
    runtime,
    factory,
    module: {
      WORKFLOW_PACKAGE_NAME: PACKAGE_NAME,
      createWorkflowRuntime: vi.fn((_deps: Record<string, unknown>) => runtime),
      createDocumentEventProcessorFactory: vi.fn(() => factory),
    },
  };
}

function fakeProcessorManager() {
  return {
    registerFactory: vi.fn(() => Promise.resolve()),
    unregisterFactory: vi.fn(() => Promise.resolve()),
    get: vi.fn(),
    getAll: vi.fn(() => []),
  };
}

function compose(engine: ReturnType<typeof fakeEngine>, overrides = {}) {
  const processorManager = fakeProcessorManager();
  return {
    processorManager,
    composed: composeWorkflowRuntime({
      reactorClient: {} as never,
      relationalDb: { id: "relational-db" } as never,
      attachments: { id: "attachments" } as never,
      webhooks: { id: "webhooks" } as never,
      authorizationService,
      processorManager: processorManager as never,
      logger,
      load: () => Promise.resolve(engine.module as never),
      ...overrides,
    }),
  };
}

describe("composeWorkflowRuntime", () => {
  it("hands the engine the host surfaces it declares", async () => {
    const engine = fakeEngine();
    await compose(engine).composed;

    expect(engine.module.createWorkflowRuntime).toHaveBeenCalledTimes(1);
    const [deps] = engine.module.createWorkflowRuntime.mock.calls[0];
    expect(deps.relationalDb).toEqual({ id: "relational-db" });
    expect(deps.attachments).toEqual({ id: "attachments" });
    expect(deps.webhooks).toEqual({ id: "webhooks" });
    expect(typeof deps.assertCanRead).toBe("function");
  });

  it("serves a subgraph the GraphQL manager can construct", async () => {
    const engine = fakeEngine();
    const { subgraph } = await compose(engine).composed;

    expect(subgraph.prototype).toBeInstanceOf(BaseSubgraph);
  });

  it("arms the webhooks, the processor and the supervisor on start", async () => {
    const engine = fakeEngine();
    const { processorManager, composed } = compose(engine);
    const workflows = await composed;

    await workflows.start();

    expect(engine.runtime.registerWebhookEndpoint).toHaveBeenCalledTimes(1);
    expect(
      engine.module.createDocumentEventProcessorFactory,
    ).toHaveBeenCalledWith(engine.runtime, { id: "relational-db" });
    expect(processorManager.registerFactory).toHaveBeenCalledWith(
      PACKAGE_NAME,
      engine.factory,
    );
    expect(engine.runtime.startTriggerSupervisor).toHaveBeenCalledTimes(1);
  });

  it("unregisters the processor and shuts the runtime down on stop", async () => {
    const engine = fakeEngine();
    const { processorManager, composed } = compose(engine);
    const workflows = await composed;
    await workflows.start();

    await workflows.stop();

    expect(processorManager.unregisterFactory).toHaveBeenCalledWith(
      PACKAGE_NAME,
    );
    expect(engine.runtime.shutdown).toHaveBeenCalledTimes(1);
  });

  it("names the package a host would have to install when the load fails", async () => {
    const engine = fakeEngine();
    const cause = new Error("Cannot find module");
    const failing = compose(engine, {
      load: () => Promise.reject(cause),
    }).composed;

    await expect(failing).rejects.toThrow("@powerhousedao/reactor-workflow");
    await expect(failing).rejects.toMatchObject({ cause });
  });
});

describe("the flag is what gates composition", () => {
  // The host must not import the engine at all when workflows are off, so the
  // decision is the flag's alone and is taken before compose is ever called.
  const composeIfEnabled = (env: Record<string, string | undefined>) =>
    resolveWorkflowsEnabled({ env }) ? "composed" : "skipped";

  it("skips composition when the flag is off", () => {
    expect(composeIfEnabled({})).toBe("skipped");
    expect(composeIfEnabled({ PH_WORKFLOWS_ENABLED: "false" })).toBe("skipped");
  });

  it("composes when the flag is on", () => {
    expect(composeIfEnabled({ PH_WORKFLOWS_ENABLED: "true" })).toBe("composed");
  });
});
