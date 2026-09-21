// What is left of the webhook path once the reactor owns the transport: the
// per-workflow policy and a verified delivery. The rest is reactor-api's.
import type { WebhookRequest } from "@powerhousedao/shared/processors";
import type { OperationWithContext } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowRuntimeService } from "./service.js";
import { testRuntime } from "../../test/helpers/runtime.js";

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
  let fired: { workflowId: string; payload: unknown; kind: string }[];

  async function arm(config: Record<string, unknown>): Promise<void> {
    await service.onOperations([
      workflowOp({
        name: "Hook",
        status: "ENABLED",
        version: 1,
        trigger: { id: "t1", blockType: "core#webhook", config },
        steps: [],
        edges: [],
        variables: [],
      }),
    ]);
    fired.length = 0;
  }

  async function disarm(): Promise<void> {
    await service.onOperations([
      workflowOp({
        name: "Hook",
        status: "DISABLED",
        version: 2,
        trigger: { id: "t1", blockType: "core#webhook", config: {} },
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
    const built = testRuntime({
      secrets: {
        get: (ref: string) =>
          ref === SECRET_REF
            ? Promise.resolve(SECRET)
            : Promise.reject(new Error(`No secret found for ref "${ref}"`)),
      },
      webhooks,
    } as never);
    vi.spyOn(built, "fire").mockImplementation(
      (workflowId: string, payload?: unknown, kind = "manual") => {
        fired.push({ workflowId, payload, kind });
        return Promise.resolve({
          runId: "run-1",
          status: "SUCCEEDED",
          steps: [],
        } as never);
      },
    );
    return built;
  }

  beforeEach(() => {
    fired = [];
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
      let settle: (value: unknown) => void = () => undefined;
      const endpoints = {
        endpointFor: vi.fn(() =>
          Promise.resolve({
            token: "t",
            url: "https://host/webhooks/t",
            createdAt: "2026-01-01T00:00:00.000Z",
          }),
        ),
        revoke: vi.fn(),
        list: vi.fn(() => Promise.resolve([])),
      };

      service = makeService({
        register: () => new Promise((resolve) => (settle = resolve)),
      });
      const registering = service.registerWebhookEndpoint();
      const asking = service.webhookEndpoint(WORKFLOW, CTX);

      settle(endpoints);
      await registering;

      // The mint, not a scan: the caller waited for the registration rather
      // than finding no endpoint family and answering null.
      expect(await asking).toMatchObject({ url: "https://host/webhooks/t" });
      expect(endpoints.endpointFor).toHaveBeenCalledWith(WORKFLOW);
    });

    it("registers on demand when an enable beats the host's start", async () => {
      // Seeding starts from the constructor, and a restored webhook trigger's
      // enable asks for a URL from there. The host has not started the runtime
      // yet, so registration has to happen on the way in rather than the
      // trigger failing on startup order.
      const endpoints = {
        endpointFor: vi.fn(() =>
          Promise.resolve({
            token: "t",
            url: "https://host/webhooks/t",
            createdAt: "2026-01-01T00:00:00.000Z",
          }),
        ),
        revoke: vi.fn(),
        list: vi.fn(() => Promise.resolve([])),
      };
      const register = vi.fn(() => Promise.resolve(endpoints));

      const fresh = makeService({ register });

      // Never registered: only asked.
      expect(await fresh.webhookEndpoint(WORKFLOW, CTX)).toMatchObject({
        url: "https://host/webhooks/t",
      });
      expect(register).toHaveBeenCalledTimes(1);

      // And asking again does not register a second endpoint family.
      await fresh.webhookEndpoint(WORKFLOW, CTX);
      expect(register).toHaveBeenCalledTimes(1);
    });

    it("mints before the workflow is enabled", async () => {
      // The URL reaches the sender's dashboard before enabling, so gating the
      // mint on `armed` left an author with nothing to paste.
      const endpoints = {
        endpointFor: vi.fn(() =>
          Promise.resolve({
            token: "t",
            url: "https://host/webhooks/t",
            createdAt: "2026-01-01T00:00:00.000Z",
          }),
        ),
        revoke: vi.fn(),
        list: vi.fn(() => Promise.resolve([])),
      };
      service = makeService({ register: () => Promise.resolve(endpoints) });
      await service.registerWebhookEndpoint();
      // Seeding asks the family whether this host has endpoints it no longer
      // knows about; what this test watches is the mint that comes after.
      await vi.waitFor(() => expect(endpoints.list).toHaveBeenCalled());
      endpoints.list.mockClear();

      // Never armed: nothing has been published for this workflow at all.
      expect(await service.webhookEndpoint(WORKFLOW, CTX)).toMatchObject({
        url: "https://host/webhooks/t",
        armed: false,
      });
      expect(endpoints.list).not.toHaveBeenCalled();
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
  });

  // ── the policy handed to the webhook service ─────────────────────────────

  describe("policy", () => {
    it("is absent for a workflow that is not armed", async () => {
      // The service answers this exactly as it answers an unknown token, so a
      // prober cannot tell a disabled workflow from one that never existed.
      expect(await policy()).toBeUndefined();
      await arm({});
      expect(await policy()).toBeDefined();
      await disarm();
      expect(await policy()).toBeUndefined();
    });

    it("is absent when the trigger config does not parse", async () => {
      // A signed scheme with no secret ref cannot be honoured, so the endpoint
      // must not be armed at all.
      await arm({ scheme: "hmac-prefixed" });
      expect(await policy()).toBeUndefined();
    });

    it("declares no verification for an unsigned endpoint", async () => {
      await arm({});
      expect(await policy()).toMatchObject({ verify: undefined });
    });

    it("resolves the signing secret through the secret store", async () => {
      await arm({ scheme: "hmac", secretRef: SECRET_REF });
      expect(await policy()).toMatchObject({
        verify: {
          scheme: "hmac",
          header: "x-signature",
          secret: SECRET,
        },
      });
    });

    it("declares a deleted secret as absent rather than failing", async () => {
      // The webhook service refuses a signed endpoint with no secret, which is
      // the same answer as a bad signature.
      await arm({
        scheme: "hmac",
        secretRef: "secret://v1:ffffffffffffffffffffffffffffffff",
      });
      expect(await policy()).toMatchObject({
        verify: { scheme: "hmac", secret: undefined },
      });
    });

    it("passes the author's methods, dedupe field and challenge field", async () => {
      await arm({
        methods: "POST",
        dedupeField: "id",
        dedupeTtlSeconds: 60,
        challengeField: "challenge",
      });
      expect(await policy()).toMatchObject({
        methods: ["POST"],
        dedupe: { field: "id", ttlSeconds: 60 },
        challengeField: "challenge",
      });
    });

    it("passes a header-sourced dedupe field through as a source", async () => {
      await arm({ dedupeField: "header:x-delivery-id" });
      expect(await policy()).toMatchObject({
        dedupe: { field: { header: "x-delivery-id" } },
      });
    });

    it("declares no dedupe when the author named no field", async () => {
      await arm({});
      expect(await policy()).toMatchObject({ dedupe: undefined });
    });
  });

  // ── what a verified delivery means ───────────────────────────────────────

  describe("delivery", () => {
    it("fires with the request as the trigger payload", async () => {
      await arm({});
      const reply = await service.deliverWebhook(
        request({ queryParams: { source: "github" } }),
      );

      expect(reply).toEqual({ status: 202 });
      expect(fired).toEqual([
        {
          workflowId: WORKFLOW,
          kind: "webhook",
          payload: {
            method: "POST",
            path: "/webhooks/0123456789abcdef0123456789abcdef",
            headers: { "content-type": "application/json" },
            queryParams: { source: "github" },
            body: { id: "evt_1" },
          },
        },
      ]);
    });

    it("refuses a delivery for a workflow that is no longer armed", async () => {
      await arm({});
      await disarm();
      expect(await service.deliverWebhook(request())).toEqual({ status: 401 });
      expect(fired).toHaveLength(0);
    });

    describe("sync mode", () => {
      it("reports the run outcome in the body", async () => {
        await arm({ responseMode: "sync" });
        const reply = await service.deliverWebhook(request());
        expect(reply.status).toBe(200);
        expect(JSON.parse(reply.body!)).toEqual({
          runId: "run-1",
          status: "SUCCEEDED",
          error: null,
        });
      });

      it("answers 500 for a failed run", async () => {
        await arm({ responseMode: "sync" });
        vi.spyOn(service, "fire").mockResolvedValue({
          runId: "run-2",
          status: "FAILED",
          error: "step blew up",
          steps: [],
        } as never);
        const reply = await service.deliverWebhook(request());
        expect(reply.status).toBe(500);
        expect(JSON.parse(reply.body!)).toEqual({
          runId: "run-2",
          status: "FAILED",
          error: "step blew up",
        });
      });

      it("labels the body as JSON", async () => {
        // Core defaults an unlabelled body to text/plain, so a caller that
        // dispatches on content type would stop parsing this.
        await arm({ responseMode: "sync" });
        const reply = await service.deliverWebhook(request());
        expect(reply.contentType).toBe("application/json; charset=utf-8");
      });

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

      it("answers 500 when the run throws", async () => {
        await arm({ responseMode: "sync" });
        vi.spyOn(service, "fire").mockRejectedValue(new Error("no such step"));
        const reply = await service.deliverWebhook(request());
        expect(reply.status).toBe(500);
        expect(JSON.parse(reply.body!)).toEqual({ error: "no such step" });
      });
    });

    it("answers async mode before the run finishes", async () => {
      await arm({ responseMode: "async", responseStatus: 204 });
      const reply = await service.deliverWebhook(request());
      expect(reply).toEqual({ status: 204 });
    });
  });
});

describe("WorkflowRuntimeService registry seeding", () => {
  // The registry is seeded from the constructor: a host that rebuilds its
  // runtime gets a fresh sweep, and there is nothing to re-seed in between.
  function seededRuntime(workflows: unknown[]) {
    const find = vi.fn(() => Promise.resolve({ results: workflows }));
    return {
      find,
      service: testRuntime({
        reactorClient: { find },
        webhooks: { register: () => Promise.reject(new Error("no")) },
      } as never),
    };
  }

  const enabledWorkflow = (id: string) => ({
    header: { id },
    state: {
      global: {
        name: "Hook",
        status: "ENABLED",
        version: 1,
        trigger: { id: "t1", blockType: "core#webhook", config: {} },
        steps: [],
        edges: [],
        variables: [],
      },
    },
  });

  it("sweeps the reactor once, from the constructor", async () => {
    const first = seededRuntime([enabledWorkflow("wf-1")]);
    await vi.waitFor(() => expect(first.find).toHaveBeenCalledOnce());

    // A replacement runtime sweeps for itself; the first one never sweeps again.
    const second = seededRuntime([enabledWorkflow("wf-1")]);
    await vi.waitFor(() => expect(second.find).toHaveBeenCalledOnce());
    expect(first.find).toHaveBeenCalledOnce();
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
