// What is left of the webhook path once the reactor owns the transport: the
// per-workflow policy and a verified delivery. The rest is reactor-api's.
import type { WebhookRequest } from "@powerhousedao/shared/processors";
import type { OperationWithContext } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WorkflowRuntimeClosedError,
  type WorkflowRuntimeService,
} from "./service.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { CORE_PIECE_VERSION } from "../pieces/index.js";
import { memoryWebhooks } from "../../test/helpers/webhooks.js";

const WORKFLOW_TYPE = "powerhouse/workflow";
const WORKFLOW = "wf-hook";
const SECRET_REF = "secret://v1:00112233445566778899aabbccddeeff";
const SECRET = "s3cret";
// The URL carries the workflow's webhook token, so minting one is a read.
const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

let ordinal = 0;

function workflowOp(state: Record<string, unknown>): OperationWithContext {
  ordinal += 1;
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: "SET_WORKFLOW_NAME", input: {} },
      resultingState: JSON.stringify(state),
    },
    context: {
      documentId: WORKFLOW,
      documentType: WORKFLOW_TYPE,
      scope: "global",
      branch: "main",
      ordinal,
    },
  } as unknown as OperationWithContext;
}

const request = (overrides: Partial<WebhookRequest> = {}): WebhookRequest => ({
  key: WORKFLOW,
  method: "POST",
  path: "/webhooks/0123456789abcdef0123456789abcdef",
  queryParams: {},
  headers: { "content-type": "application/json" },
  raw: Buffer.from('{"id":"evt_1"}', "utf8"),
  body: { id: "evt_1" },
  ...overrides,
});

describe("WorkflowRuntimeService webhooks", () => {
  let service: WorkflowRuntimeService;

  async function arm(config: Record<string, unknown>): Promise<void> {
    await service.onOperations([
      workflowOp({
        name: "Hook",
        status: "ENABLED",
        version: 1,
        trigger: {
          id: "t1",
          pieceName: "@powerhousedao/piece-core",
          pieceVersion: CORE_PIECE_VERSION,
          triggerName: "webhook",
          config: { scheme: "none", ...config },
        },
        steps: [],
        edges: [],
        variables: [],
      }),
    ]);
  }

  const policy = () => service.webhookPolicy(WORKFLOW);

  // A runtime is built per test rather than reconfigured: the webhook scope is
  // a constructor dependency, so a suite that needs one builds its own.
  function makeService(webhooks?: unknown): WorkflowRuntimeService {
    return testRuntime({
      secrets: {
        get: (ref: string) =>
          ref === SECRET_REF
            ? Promise.resolve(SECRET)
            : Promise.reject(new Error(`No secret found for ref "${ref}"`)),
      },
      webhooks,
    } as never);
  }

  beforeEach(() => {
    service = makeService();
  });

  // A runtime left running keeps its supervisor's timer and its logger alive
  // past the test, and vitest tears the worker's rpc down underneath it:
  // "Closing rpc while onUserConsoleLog was pending".
  afterEach(() => {
    service.shutdown();
  });

  // ── registration ─────────────────────────────────────────────────────────

  describe("registration", () => {
    it("survives a host that has no webhook store", async () => {
      // Webhooks unavailable means no webhook triggers, not no workflows;
      // rethrowing would take every other trigger down with it.
      service = makeService({
        register: () => Promise.reject(new Error("not available")),
      });
      await expect(service.registerWebhookEndpoint()).resolves.toBeUndefined();

      expect(await service.webhookEndpoint(WORKFLOW, CTX)).toBeNull();
    });

    it("lets a caller that needs a token wait for the registration", async () => {
      // Seeding starts from the constructor, before the host registers, so a
      // webhook workflow restored at boot must not find the registry unset.
      const { rows, scope } = memoryWebhooks();
      let settle: () => void = () => undefined;
      service = makeService({
        hasPublicOrigin: true,
        register: () =>
          new Promise((resolve) => {
            settle = () => resolve(scope.register({} as never));
          }),
      });
      const registering = service.registerWebhookEndpoint();
      const asking = service.webhookEndpoint(WORKFLOW, CTX);

      settle();
      await registering;

      // Minted, not null: the caller waited for the registration.
      expect(await asking).toMatchObject({ url: rows.get(WORKFLOW)!.url });
    });

    it("registers on demand when an enable beats the host's start", async () => {
      // A restored trigger asks for a URL before the host starts the runtime,
      // so registration happens on the way in.
      // Each registration is a fresh family: a second one would mint a new URL.
      const fresh = makeService({
        hasPublicOrigin: true,
        register: () => memoryWebhooks().scope.register({} as never),
      });

      const first = await fresh.webhookEndpoint(WORKFLOW, CTX);
      expect(first?.url).toMatch(/^https:\/\/hooks\.test\/webhooks\//);
      expect(await fresh.webhookEndpoint(WORKFLOW, CTX)).toMatchObject({
        url: first!.url,
      });
    });

    it("mints before the workflow is enabled", async () => {
      // The URL reaches the sender's dashboard before enabling, so the mint is
      // not gated on `armed`.
      const { rows, scope } = memoryWebhooks();
      service = makeService(scope);
      await service.registerWebhookEndpoint();

      // Never armed: nothing has been published for this workflow at all.
      expect(await service.webhookEndpoint(WORKFLOW, CTX)).toMatchObject({
        url: rows.get(WORKFLOW)!.url,
        armed: false,
      });
    });

    it("tells the author when the advertised URL is missing its origin", async () => {
      // With no public origin the URL is a bare path, which fails silently in
      // a provider's console — so the record carries that difference too.
      const endpoints = {
        endpointFor: () =>
          Promise.resolve({
            token: "t",
            url: "/webhooks/t",
            createdAt: "2026-01-01T00:00:00.000Z",
          }),
        revoke: vi.fn(),
        list: () => Promise.resolve([]),
      };
      service = makeService({
        register: () => Promise.resolve(endpoints),
        hasPublicOrigin: false,
      });
      await service.registerWebhookEndpoint();
      await arm({});

      expect(await service.webhookEndpoint(WORKFLOW, CTX)).toMatchObject({
        url: "/webhooks/t",
        absoluteUrl: false,
      });
    });

    it("puts a trigger whose config is refused in ERROR, until it arms", async () => {
      const store = (await service.store())!;
      await service.onOperations([
        workflowOp({
          name: "Hook",
          status: "ENABLED",
          version: 1,
          // No scheme: refused rather than armed unauthenticated.
          trigger: {
            id: "t1",
            pieceName: "@powerhousedao/piece-core",
            pieceVersion: CORE_PIECE_VERSION,
            triggerName: "webhook",
            config: {},
          },
          steps: [],
          edges: [],
          variables: [],
        }),
      ]);

      await vi.waitFor(async () =>
        expect((await store.getTriggerState(WORKFLOW))?.status).toBe("ERROR"),
      );
      const row = await store.getTriggerState(WORKFLOW);
      expect(row).toMatchObject({
        piece_name: "@powerhousedao/piece-core",
        trigger_name: "webhook",
      });
      expect(row?.last_error).toContain('"scheme" is required');
      expect(await policy()).toBeUndefined();

      await arm({});
      await vi.waitFor(async () =>
        expect((await store.getTriggerState(WORKFLOW))?.status).toBe(
          "DISABLED",
        ),
      );
      expect(await policy()).toBeDefined();
    });
  });

  // ── what a verified delivery means ───────────────────────────────────────

  // Policy and the reply shapes are covered over HTTP in Switchboard's
  // webhook-{unsigned,signed,dedupe} suites; these need a run that hangs or throws.
  describe("delivery in sync mode", () => {
    it("answers 504 without waiting for a wedged run", async () => {
      // Sync mode holds the provider's socket. An unbounded wait lets a
      // stuck step tie up connections one delivery at a time.
      vi.useFakeTimers();
      try {
        await arm({ responseMode: "sync" });
        vi.spyOn(service, "fire").mockReturnValue(
          new Promise(() => {
            /* never settles */
          }) as never,
        );

        const pending = service.deliverWebhook(request());
        await vi.advanceTimersByTimeAsync(30_000);
        const reply = await pending;

        expect(reply.status).toBe(504);
        expect(JSON.parse(reply.body!)).toEqual({
          status: "RUNNING",
          error: "The run did not finish in time",
        });
      } finally {
        vi.useRealTimers();
      }
    });

    // A deliberate refusal is not a failure: 500 makes a provider retry it
    // forever, each retry journaling another CANCELLED run.
    it("answers a refused firing with 409, and a full queue with 429", async () => {
      await arm({ responseMode: "sync" });
      const fire = vi.spyOn(service, "fire");
      const replyFor = async (refusal?: string, status = "CANCELLED") => {
        fire.mockResolvedValueOnce({
          status,
          steps: [],
          runId: "run-1",
          ...(refusal ? { refusal } : {}),
        } as never);
        return (await service.deliverWebhook(request())).status;
      };

      expect(await replyFor("parked")).toBe(409);
      expect(await replyFor("singleton")).toBe(409);
      expect(await replyFor("stale")).toBe(409);
      expect(await replyFor("queue-full")).toBe(429);
      expect(await replyFor(undefined, "FAILED")).toBe(500);
      expect(await replyFor(undefined, "CANCELLED")).toBe(500);
    });

    // A runtime shut down after losing the workflow singleton sits on a live
    // reactor; the sender has to retry against the owner instead.
    it("answers 503 and starts no run once the runtime has shut down", async () => {
      await arm({ responseMode: "async" });
      service.shutdown();
      await expect(service.fire(WORKFLOW)).rejects.toThrow("shut down");
      const fire = vi.spyOn(service, "fire");

      const reply = await service.deliverWebhook(request());

      expect(reply).toMatchObject({ status: 503, unprocessed: true });
      expect(fire).not.toHaveBeenCalled();
    });

    // Shut down while a sync delivery waited for its slot: 500 would keep the
    // dedupe key, so the provider's retry to the new owner reads as a
    // duplicate and the delivery is lost.
    it("answers 503 when the runtime shuts down under a sync delivery", async () => {
      await arm({ responseMode: "sync" });
      let refuse!: () => void;
      vi.spyOn(service, "fire").mockReturnValue(
        new Promise((_, reject) => {
          refuse = () => {
            service.shutdown();
            reject(new WorkflowRuntimeClosedError(WORKFLOW));
          };
        }) as never,
      );

      const pending = service.deliverWebhook(request());
      refuse();
      const reply = await pending;

      expect(reply).toMatchObject({ status: 503, unprocessed: true });
    });

    it("answers 500 when the run throws", async () => {
      await arm({ responseMode: "sync" });
      vi.spyOn(service, "fire").mockRejectedValue(new Error("no such step"));
      const reply = await service.deliverWebhook(request());
      expect(reply.status).toBe(500);
      expect(JSON.parse(reply.body!)).toEqual({ error: "no such step" });
    });
  });
});

describe("WorkflowRuntimeService registry seeding", () => {
  const enabledWorkflow = (id: string) => ({
    header: { id },
    state: {
      global: {
        name: "Hook",
        status: "ENABLED",
        version: 1,
        trigger: {
          id: "t1",
          pieceName: "@powerhousedao/piece-core",
          pieceVersion: CORE_PIECE_VERSION,
          triggerName: "webhook",
          config: { scheme: "none" },
        },
        steps: [],
        edges: [],
        variables: [],
      },
    },
  });

  it("answers no policy until seeding has finished", async () => {
    // A delivery can beat the seed, and an unseeded registry is refused
    // exactly as an unknown token is — so it must not be reachable early.
    let release: (value: { results: unknown[] }) => void = () => undefined;
    const find = vi.fn(
      () =>
        new Promise<{ results: unknown[] }>((resolve) => (release = resolve)),
    );
    const service = testRuntime({
      reactorClient: { find },
      webhooks: { register: () => Promise.reject(new Error("no")) },
    } as never);

    const asking = service.webhookPolicy("wf-1");

    release({ results: [enabledWorkflow("wf-1")] });
    expect(await asking).toMatchObject({ methods: undefined });
  });
});
