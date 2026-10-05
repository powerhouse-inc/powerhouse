// Shared harness: the suites go over a real socket through the reactor's own
// adapter, route service and webhook service, which the unit tests cannot.
import {
  createHttpAdapter,
  getDbClient,
  HttpRouteService,
  MemoryWebhookStore,
  WebhookService,
} from "@powerhousedao/reactor-api";
import {
  createWorkflowRuntime,
  type WorkflowRuntimeService,
} from "@powerhousedao/reactor-workflow";
import {
  createRelationalDb,
  type IRelationalDb,
} from "@powerhousedao/shared/processors";
import type { OperationWithContext } from "document-model";
import type { Kysely } from "kysely";
import { vi } from "vitest";
import {
  CORE_PIECE_NAME,
  CORE_PIECE_VERSION,
} from "@powerhousedao/reactor-workflow";

export const WORKFLOW_TYPE = "powerhouse/workflow";
export const PACKAGE_NAME = "@powerhousedao/workflow";
/** A ref the harness's secret store resolves; anything else rejects. */
export const SECRET_REF = "secret://v1:00112233445566778899aabbccddeeff";
export const SECRET = "s3cret";
// Minting an endpoint is a read of the workflow, so the harness asks as one.
const CALLER = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

export interface FiredRun {
  workflowId: string;
  payload: unknown;
  kind: string;
}

export interface TriggerFields {
  pieceName: string;
  pieceVersion: string;
  triggerName: string;
}

// The core piece's webhook trigger, pinned to the installed core piece.
export const WEBHOOK_TRIGGER: TriggerFields = {
  pieceName: CORE_PIECE_NAME,
  pieceVersion: CORE_PIECE_VERSION,
  triggerName: "webhook",
};

export interface WebhookHost {
  /** Origin the endpoint is served from, e.g. `http://127.0.0.1:53124`. */
  readonly url: string;
  /** Runs the trigger started, in order. Cleared by `arm`. */
  readonly fired: FiredRun[];
  readonly service: WorkflowRuntimeService;
  /** Publishes an ENABLED workflow with `config`; returns its endpoint. */
  arm(
    config: Record<string, unknown>,
    options?: { trigger?: TriggerFields; workflowId?: string },
  ): Promise<{ token: string; url: string }>;
  /** Publishes the same workflow as DISABLED, keeping its endpoint row. */
  disarm(workflowId?: string): Promise<void>;
  /** Deletes the workflow document, as the reactor reports it. */
  remove(workflowId?: string): Promise<void>;
  /** Whether the reactor's webhook store still holds this token. */
  hasToken(token: string): Promise<boolean>;
  /** The policy the service hands the reactor for one endpoint. */
  policyFor(workflowId?: string): Promise<unknown>;
  deliver(
    token: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      query?: Record<string, string>;
    },
  ): Promise<Response>;
  stop(): Promise<void>;
}

export const DEFAULT_WORKFLOW = "wf-integration";

// Module-scoped: the service ignores any ordinal at or below the highest it
// has seen, so a per-host counter would make a file's second host see nothing.
let ordinal = 0;

export function workflowOperation(
  state: Record<string, unknown>,
  workflowId = DEFAULT_WORKFLOW,
): OperationWithContext {
  ordinal += 1;
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: "SET_WORKFLOW_NAME", input: {} },
      resultingState: JSON.stringify(state),
    },
    context: {
      documentId: workflowId,
      documentType: WORKFLOW_TYPE,
      scope: "global",
      branch: "main",
      ordinal,
    },
  } as unknown as OperationWithContext;
}

// `publicUrl` is known only after `listen`: a family registered against the
// wrong origin advertises URLs no caller can reach.
export async function startWebhookHost(
  options: {
    fire?: (run: FiredRun) => unknown;
    // Reads and writes of the workflow documents; none by default.
    reactorClient?: unknown;
  } = {},
): Promise<WebhookHost> {
  // The public factory, not the adapter class: the class is internal, so
  // constructing it would test a path no consumer can take.
  const { adapter } = await createHttpAdapter("express");
  adapter.setupMiddleware({});
  const server = await adapter.listen(0, undefined, "127.0.0.1");
  const { port } = server.address() as { port: number };
  const url = `http://127.0.0.1:${port}`;

  const webhookStore = new MemoryWebhookStore();
  const webhooks = new WebhookService({ store: webhookStore });
  const routes = new HttpRouteService({
    httpAdapter: adapter,
    webhooks,
    publicUrl: url,
  });
  // Core serves the endpoint family from its own host scope, exactly as the
  // reactor wires it: nothing here touches the adapter directly.
  webhooks.attach(routes.hostScope("@powerhousedao/reactor-api", "/webhooks"));

  const { db } = getDbClient();
  const fired: FiredRun[] = [];

  // Every host surface the runtime asks for, and nothing it does not: no run
  // here reaches the reactor, and the secret store answers one fixed ref.
  const service = createWorkflowRuntime({
    relationalDb: createRelationalDb(
      db as unknown as Kysely<unknown>,
    ) as IRelationalDb,
    reactorClient: options.reactorClient ?? {
      get: () => Promise.reject(new Error("not used")),
      find: () => Promise.resolve({ results: [] }),
    },
    assertCanRead: () => Promise.resolve(undefined),
    assertCanWrite: () => Promise.resolve(undefined),
    webhooks: routes.scopeFor(PACKAGE_NAME).webhooks,
    secrets: {
      get: (ref: string) =>
        ref === SECRET_REF
          ? Promise.resolve(SECRET)
          : Promise.reject(new Error(`No secret found for ref "${ref}"`)),
    },
  } as never);
  vi.spyOn(service, "fire").mockImplementation(
    (workflowId: string, payload?: unknown, kind = "manual") => {
      const run = { workflowId, payload, kind };
      fired.push(run);
      const outcome = options.fire?.(run);
      return Promise.resolve(
        (outcome ?? {
          runId: `run-${fired.length}`,
          status: "SUCCEEDED",
          steps: [],
        }) as never,
      );
    },
  );

  await service.registerWebhookEndpoint();

  const publish = async (
    config: Record<string, unknown>,
    status: string,
    trigger: TriggerFields,
    workflowId: string,
  ) => {
    await service.onOperations([
      workflowOperation(
        {
          name: "Integration",
          status,
          version: ordinal + 1,
          trigger: { id: "t1", ...trigger, config },
          steps: [],
          edges: [],
          variables: [],
        },
        workflowId,
      ),
    ]);
  };

  return {
    url,
    fired,
    service,
    async arm(config, opts = {}) {
      const workflowId = opts.workflowId ?? DEFAULT_WORKFLOW;
      // The runtime requires a scheme; an unsigned suite names "none".
      await publish(
        { scheme: "none", ...config },
        "ENABLED",
        opts.trigger ?? WEBHOOK_TRIGGER,
        workflowId,
      );
      const endpoint = await service.webhookEndpoint(workflowId, CALLER);
      if (!endpoint) throw new Error(`No endpoint minted for ${workflowId}`);
      fired.length = 0;
      return {
        url: endpoint.url,
        token: endpoint.url.slice(endpoint.url.lastIndexOf("/") + 1),
      };
    },
    async disarm(workflowId = DEFAULT_WORKFLOW) {
      await publish({}, "DISABLED", WEBHOOK_TRIGGER, workflowId);
    },
    async remove(workflowId = DEFAULT_WORKFLOW) {
      ordinal += 1;
      await service.onOperations([
        {
          operation: {
            index: ordinal,
            timestampUtcMs: `${ordinal}`,
            action: {
              type: "DELETE_DOCUMENT",
              input: { documentId: workflowId },
            },
          },
          context: {
            documentId: workflowId,
            documentType: WORKFLOW_TYPE,
            scope: "document",
            branch: "main",
            ordinal,
          },
        } as unknown as OperationWithContext,
      ]);
    },
    async hasToken(token) {
      return (await webhookStore.find(token)) !== undefined;
    },
    policyFor(workflowId = DEFAULT_WORKFLOW) {
      return service.webhookPolicy(workflowId);
    },
    deliver(token, init = {}) {
      const query = init.query
        ? `?${new URLSearchParams(init.query).toString()}`
        : "";
      return fetch(`${url}/webhooks/${token}${query}`, {
        method: init.method ?? "POST",
        headers: init.headers,
        body: init.body,
      });
    },
    stop() {
      return new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

// A delivery is answered before its run starts, so asserting on `fired`
// straight after a 202 is a race that passes for the wrong reason.
export async function waitForRuns(
  host: WebhookHost,
  count: number,
  timeoutMs = 2000,
): Promise<FiredRun[]> {
  const deadline = Date.now() + timeoutMs;
  while (host.fired.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  if (host.fired.length < count) {
    throw new Error(
      `Expected ${count} run(s), saw ${host.fired.length} within ${timeoutMs}ms`,
    );
  }
  return host.fired;
}
