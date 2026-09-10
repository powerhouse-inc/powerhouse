// What is left of the webhook path once the reactor owns the transport: the
// per-workflow policy and a verified delivery. The rest is reactor-api's.
import type { WebhookRequest } from "@powerhousedao/reactor-api";
import type { OperationWithContext } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowRuntimeService } from "./service.js";

const WORKFLOW_TYPE = "powerhouse/workflow";
const WORKFLOW = "wf-hook";
const SECRET_REF = "secret://v1:00112233445566778899aabbccddeeff";
const SECRET = "s3cret";

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

  const policy = () =>
    (
      service as unknown as {
        webhookPolicy: (id: string) => Promise<unknown>;
      }
    ).webhookPolicy(WORKFLOW);

  beforeEach(() => {
    service = new WorkflowRuntimeService();
    fired = [];
    (service as unknown as { subgraph: unknown }).subgraph = {
      reactorClient: { get: () => Promise.reject(new Error("not used")) },
    };
    (service as unknown as { secretsPromise: unknown }).secretsPromise =
      Promise.resolve({
        get: (ref: string) =>
          ref === SECRET_REF
            ? Promise.resolve(SECRET)
            : Promise.reject(new Error(`No secret found for ref "${ref}"`)),
      });
    vi.spyOn(service, "fire").mockImplementation(
      (workflowId: string, payload?: unknown, kind = "manual") => {
        fired.push({ workflowId, payload, kind });
        return Promise.resolve({
          runId: "run-1",
          status: "SUCCEEDED",
          steps: [],
        } as never);
      },
    );
  });

  // ── registration ─────────────────────────────────────────────────────────

  describe("registration", () => {
    const subgraphWith = (webhooks: unknown) =>
      ({
        http: { webhooks },
        reactorClient: { get: () => Promise.reject(new Error("not used")) },
      }) as never;

    it("survives a host that has no webhook store", async () => {
      // Webhooks unavailable means no webhook triggers, not no workflows; the
      // manager awaits onSetup, so rethrowing takes the whole subgraph down.
      await expect(
        service.registerWebhookEndpoint(
          subgraphWith({
            register: () => Promise.reject(new Error("not available")),
          }),
        ),
      ).resolves.toBeUndefined();

      expect(await service.webhookEndpoint(WORKFLOW)).toBeNull();
    });

    it("lets a caller that needs a token wait for the registration", async () => {
      // Seeding starts from the subgraph's constructor, before onSetup, so a
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

      const registering = service.registerWebhookEndpoint(
        subgraphWith({
          register: () => new Promise((resolve) => (settle = resolve)),
        }),
      );
      const asking = service.webhookEndpoint(WORKFLOW);

      settle(endpoints);
      await registering;

      // The mint, not a scan: the caller waited for the registration rather
      // than finding no endpoint family and answering null.
      expect(await asking).toMatchObject({ url: "https://host/webhooks/t" });
      expect(endpoints.endpointFor).toHaveBeenCalledWith(WORKFLOW);
    });

    it("registers on demand when an enable beats onSetup", async () => {
      // configure() starts seeding from the subgraph's constructor, and a
      // restored webhook trigger's enable asks for a URL from there. onSetup
      // has not run yet, so registration has to happen on the way in rather
      // than the trigger failing on startup order.
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

      const fresh = new WorkflowRuntimeService();
      fresh.configure(subgraphWith({ register }));

      // Never registered: only asked.
      expect(await fresh.webhookEndpoint(WORKFLOW)).toMatchObject({
        url: "https://host/webhooks/t",
      });
      expect(register).toHaveBeenCalledTimes(1);

      // And asking again does not register a second endpoint family.
      await fresh.webhookEndpoint(WORKFLOW);
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
      await service.registerWebhookEndpoint(
        subgraphWith({ register: () => Promise.resolve(endpoints) }),
      );

      // Never armed: nothing has been published for this workflow at all.
      expect(await service.webhookEndpoint(WORKFLOW)).toMatchObject({
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
      await service.registerWebhookEndpoint(
        subgraphWith({
          register: () => Promise.resolve(endpoints),
          hasPublicOrigin: false,
        }),
      );
      await arm({});

      expect(await service.webhookEndpoint(WORKFLOW)).toMatchObject({
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
  // A subgraph is rebuilt on every package hot-reload, and the service is a
  // module singleton, so `configure` sees a new one each time.
  function fakeSubgraph(workflows: unknown[]) {
    const find = vi.fn(() => Promise.resolve({ results: workflows }));
    return {
      find,
      subgraph: {
        relationalDb: undefined,
        reactorClient: { find },
        http: { webhooks: { register: () => Promise.reject(new Error("no")) } },
      } as never,
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

  it("re-seeds when a hot reload hands it a new subgraph", async () => {
    // The guard used to be `if (this.subgraph) return`, so a replaced subgraph
    // never re-seeded and the registry stayed empty for the process's life.
    const service = new WorkflowRuntimeService();
    const first = fakeSubgraph([enabledWorkflow("wf-1")]);
    service.configure(first.subgraph);
    await vi.waitFor(() => expect(first.find).toHaveBeenCalledOnce());

    const second = fakeSubgraph([enabledWorkflow("wf-1")]);
    service.configure(second.subgraph);
    await vi.waitFor(() => expect(second.find).toHaveBeenCalledOnce());
  });

  it("does not re-seed when handed the same subgraph twice", async () => {
    const service = new WorkflowRuntimeService();
    const only = fakeSubgraph([]);
    service.configure(only.subgraph);
    service.configure(only.subgraph);
    await vi.waitFor(() => expect(only.find).toHaveBeenCalledOnce());
  });

  it("answers no policy until seeding has finished", async () => {
    // A delivery can beat the seed, and an unseeded registry is refused
    // exactly as an unknown token is — so it must not be reachable early.
    const service = new WorkflowRuntimeService();
    let release: (value: { results: unknown[] }) => void = () => undefined;
    const find = vi.fn(
      () =>
        new Promise<{ results: unknown[] }>((resolve) => (release = resolve)),
    );
    service.configure({
      relationalDb: undefined,
      reactorClient: { find },
      http: { webhooks: { register: () => Promise.reject(new Error("no")) } },
    } as never);

    const asking = (
      service as unknown as {
        webhookPolicy: (id: string) => Promise<unknown>;
      }
    ).webhookPolicy("wf-1");

    release({ results: [enabledWorkflow("wf-1")] });
    expect(await asking).toMatchObject({ methods: undefined });
  });
});
