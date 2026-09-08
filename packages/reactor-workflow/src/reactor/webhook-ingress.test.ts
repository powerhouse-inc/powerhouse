// Webhook ingress: the strategy dispatch that mints a delivery token, the
// endpoint store, the rate limiter, and the delivery path that runs a trigger
// after the resolver has already answered.
import { getDbClient } from "@powerhousedao/reactor-api";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WorkflowRunStore } from "./store.js";
import { hashToken, TriggerSupervisor } from "./trigger-supervisor.js";
import {
  constantTimeEqual,
  TokenBucket,
  webhookEndpointUrl,
  webhookIngressEnabled,
} from "./webhook-ingress.js";

// A webhook-strategy trigger that records what it was handed, so the test can
// assert on the URL the supervisor built and the payload it delivered.
const FIXTURE = `
const app = {
  displayName: "Webhook Fixture",
  actions: {},
  triggers: {
    on_thing: {
      name: "on_thing",
      displayName: "On thing",
      type: "WEBHOOK",
      props: {},
      onEnable: async (ctx) => {
        await ctx.store.put("enabled_with", ctx.webhookUrl);
      },
      onDisable: async (ctx) => {
        await ctx.store.put("disabled", true);
      },
      run: async (ctx) => {
        const payload = ctx.payload;
        if (!payload) return [{ _dedupe_key: "sweep", swept: true }];
        return [{ _dedupe_key: "d-" + payload.docId, docId: payload.docId }];
      },
    },
  },
};
module.exports = { app };
`;

let cacheDir = "";
let store: WorkflowRunStore;
let supervisor: TriggerSupervisor;
let fired: { workflowId: string; payload: unknown; kind: string }[] = [];

const ENDPOINT = "https://switchboard.example.com/graphql/workflow-runtime";

function binding(workflowId: string) {
  return {
    workflowId,
    blockType: "@test/webhook@1.0.0#trigger:on_thing",
    packageName: "@test/webhook",
    version: "1.0.0",
    triggerName: "on_thing",
    config: {},
  };
}

describe("webhook ingress primitives", () => {
  it("gates the mutation behind an explicit opt-in", () => {
    const previous = { ...process.env };
    try {
      delete process.env.PH_WEBHOOK_INGRESS;
      process.env.NODE_ENV = "production";
      expect(webhookIngressEnabled()).toBe(false);

      process.env.PH_WEBHOOK_INGRESS = "true";
      expect(webhookIngressEnabled()).toBe(true);

      process.env.NODE_ENV = "development";
      process.env.PH_WEBHOOK_INGRESS = "false";
      expect(webhookIngressEnabled()).toBe(false);
    } finally {
      process.env = previous;
    }
  });

  it("derives the delivery endpoint from the public origin", () => {
    const previous = { ...process.env };
    try {
      delete process.env.PH_WEBHOOK_ENDPOINT_URL;
      delete process.env.PH_PUBLIC_URL;
      delete process.env.PUBLIC_URL;
      expect(webhookEndpointUrl()).toBeUndefined();

      process.env.PH_PUBLIC_URL = "https://switchboard.example.com/";
      expect(webhookEndpointUrl()).toBe(ENDPOINT);

      process.env.PH_WEBHOOK_ENDPOINT_URL = "https://custom.example.com/hook/";
      expect(webhookEndpointUrl()).toBe("https://custom.example.com/hook");
    } finally {
      process.env = previous;
    }
  });

  it("compares digests without leaking a mismatch's position", () => {
    const a = hashToken("token-a");
    expect(constantTimeEqual(a, a)).toBe(true);
    expect(constantTimeEqual(a, hashToken("token-b"))).toBe(false);
    // A stored value that is not a digest never matches.
    expect(constantTimeEqual(a, "short")).toBe(false);
  });

  it("limits deliveries per endpoint within a window", () => {
    let now = 0;
    const bucket = new TokenBucket(2, 1_000, () => now);

    expect(bucket.take("a")).toBe(true);
    expect(bucket.take("a")).toBe(true);
    expect(bucket.take("a")).toBe(false);
    // A different endpoint has its own budget.
    expect(bucket.take("b")).toBe(true);

    now = 1_001;
    expect(bucket.take("a")).toBe(true);
  });
});

describe("webhook endpoint store", () => {
  beforeAll(async () => {
    const { db } = getDbClient();
    store = await WorkflowRunStore.create(createRelationalDb(db));
  }, 60_000);

  it("stores only the token hash, and finds an endpoint by it", async () => {
    const hash = hashToken("delivery-token-1");
    await store.upsertWebhookEndpoint({
      token_hash: hash,
      workflow_id: "wf-store",
      block_type: "@test/webhook@1.0.0#trigger:on_thing",
      created_at: new Date("2026-09-08T10:00:00Z").toISOString(),
      last_delivery_at: null,
      delivery_count: 0,
    });

    const found = await store.findWebhookEndpoint(hash);
    expect(found).toMatchObject({ workflow_id: "wf-store", delivery_count: 0 });
    expect(await store.findWebhookEndpoint(hashToken("wrong"))).toBeUndefined();

    await store.recordWebhookDelivery(hash, "2026-09-08T10:05:00.000Z");
    expect(await store.findWebhookEndpoint(hash)).toMatchObject({
      delivery_count: 1,
      last_delivery_at: "2026-09-08T10:05:00.000Z",
    });

    await store.deleteWebhookEndpoints("wf-store");
    expect(await store.findWebhookEndpoint(hash)).toBeUndefined();
  });
});

describe("TriggerSupervisor webhook strategy", () => {
  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "wf-webhook-"));
    const dir = join(cacheDir, "@test-webhook-1.0.0");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "@test/webhook", version: "1.0.0", main: "index.js" }),
    );
    await writeFile(join(dir, "index.js"), FIXTURE);

    const { db } = getDbClient();
    store = await WorkflowRunStore.create(createRelationalDb(db));
  }, 60_000);

  beforeEach(() => {
    fired = [];
    supervisor = new TriggerSupervisor({
      store: () => Promise.resolve(store),
      resolveAuth: () => Promise.resolve(undefined),
      fire: (workflowId, payload, kind) => {
        fired.push({ workflowId, payload, kind });
      },
      cacheDir,
      webhookEndpointUrl: ENDPOINT,
      reconcileIntervalMs: 900_000,
    });
  });

  afterAll(() => {
    supervisor.stop();
  });

  it("mints a token, hands the piece endpoint#token, and stores only the hash", async () => {
    await supervisor.upsert(binding("wf-enable"));

    const row = await store.getTriggerState("wf-enable");
    expect(row?.status).toBe("ENABLED");
    // The reconciliation sweep replaces the poll interval, so a dropped
    // delivery is still recovered.
    expect(row?.interval_ms).toBe(900_000);

    // The piece store is scoped per flow, the way AP's engine lays it out.
    const enabledWith = (
      JSON.parse(row!.store_state) as Record<string, string | undefined>
    )["flow_wf-enable/enabled_with"];
    expect(enabledWith).toMatch(
      new RegExp(`^${ENDPOINT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}#.+`),
    );

    const token = enabledWith!.split("#")[1];
    expect(token).toHaveLength(43); // 32 bytes, base64url
    const endpoint = await store.findWebhookEndpoint(hashToken(token));
    expect(endpoint).toMatchObject({ workflow_id: "wf-enable" });
  });

  it("refuses to enable a webhook trigger with no public endpoint", async () => {
    const unconfigured = new TriggerSupervisor({
      store: () => Promise.resolve(store),
      resolveAuth: () => Promise.resolve(undefined),
      fire: () => undefined,
      cacheDir,
    });

    await unconfigured.upsert(binding("wf-no-url"));

    const row = await store.getTriggerState("wf-no-url");
    expect(row?.status).toBe("ERROR");
    expect(row?.last_error).toMatch(/no public webhook endpoint/);
    unconfigured.stop();
  });

  it("runs the trigger with the delivery payload and fires through dedupe", async () => {
    await supervisor.upsert(binding("wf-deliver"));

    await supervisor.deliverWebhook("wf-deliver", { docId: 42 });

    expect(fired).toEqual([
      {
        workflowId: "wf-deliver",
        payload: { _dedupe_key: "d-42", docId: 42 },
        kind: "piece:@test/webhook@1.0.0#trigger:on_thing",
      },
    ]);

    // A redelivery of the same event is suppressed by the existing claim.
    await supervisor.deliverWebhook("wf-deliver", { docId: 42 });
    expect(fired).toHaveLength(1);

    // A different document still gets through.
    await supervisor.deliverWebhook("wf-deliver", { docId: 43 });
    expect(fired).toHaveLength(2);
  });

  it("ignores a delivery for a workflow it does not supervise", async () => {
    await supervisor.deliverWebhook("wf-unknown", { docId: 1 });
    expect(fired).toEqual([]);
  });

  it("drops the endpoint row when the trigger is disabled", async () => {
    await supervisor.upsert(binding("wf-disable"));
    const row = await store.getTriggerState("wf-disable");
    const token = (
      JSON.parse(row!.store_state) as Record<string, string>
    )["flow_wf-disable/enabled_with"].split("#")[1];

    await supervisor.remove("wf-disable");

    expect(await store.findWebhookEndpoint(hashToken(token))).toBeUndefined();
    expect((await store.getTriggerState("wf-disable"))?.status).toBe(
      "DISABLED",
    );
  });
});
