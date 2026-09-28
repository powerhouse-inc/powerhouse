// Testing a core trigger: manual takes a sample payload, schedule samples a
// fire now, and webhook waits for the next delivery without running anything.
import type { WebhookRequest } from "@powerhousedao/shared/processors";
import { actions } from "@powerhousedao/workflow/document-models/workflow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Documents } from "../../test/helpers/documents.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import type { WorkflowRuntimeService } from "./service.js";
import { CORE_PIECE_NAME, CORE_PIECE_VERSION } from "../pieces/index.js";

const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;
const WORKFLOW = "wf-core-test";

let documents: Documents;
let service: WorkflowRuntimeService;
let fire: ReturnType<typeof vi.spyOn>;

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

const delivery = (body: unknown): WebhookRequest => ({
  key: WORKFLOW,
  method: "POST",
  path: "/webhooks/t",
  queryParams: { source: "test" },
  headers: { "content-type": "application/json" },
  raw: Buffer.from(JSON.stringify(body), "utf8"),
  body,
});

function draftWith(triggerName: string, config: Record<string, unknown>) {
  documents.apply(
    WORKFLOW,
    actions.setTrigger({
      id: "t1",
      pieceName: CORE_PIECE_NAME,
      pieceVersion: CORE_PIECE_VERSION,
      triggerName,
      config,
    }),
  );
}

const lastTest = () =>
  documents.byId.get(WORKFLOW)!.state.global.trigger!.lastTest;

async function journaledOutput(runId: string): Promise<unknown> {
  const [row] = await (await service.store())!.getSteps(runId);
  return row.output === null ? null : (JSON.parse(row.output) as unknown);
}

// Waits until the runtime's one-shot listener is armed.
async function listening(): Promise<void> {
  await vi.waitFor(async () =>
    expect(await service.webhookPolicy(WORKFLOW)).toBeDefined(),
  );
}

beforeEach(() => {
  documents = new Documents();
  service = testRuntime({
    reactorClient: documents.client() as never,
    webhooks: {
      register: () => Promise.resolve(endpoints),
      hasPublicOrigin: true,
    },
  } as never);
  fire = vi.spyOn(service, "fire");
});

afterEach(() => {
  service.shutdown();
});

describe("a manual trigger test", () => {
  it("saves the sample payload it was given", async () => {
    draftWith("manual", {});

    const output = await service.testTrigger(WORKFLOW, CTX, {
      payload: { invoiceId: "inv-7" },
    });

    expect(output).toEqual({ invoiceId: "inv-7" });
    expect(await journaledOutput(lastTest()!.runId)).toEqual({
      invoiceId: "inv-7",
    });
  });
});

describe("a schedule trigger test", () => {
  it("samples a fire at this moment", async () => {
    draftWith("schedule", {
      mode: "interval",
      every: 5,
      unit: "minutes",
    });

    const output = (await service.testTrigger(WORKFLOW, CTX)) as {
      firedAt: string;
      everyMs: number;
    };

    expect(Date.now() - Date.parse(output.firedAt)).toBeLessThan(10_000);
    expect(output.everyMs).toBe(300_000);
    expect(lastTest()?.runId).toBeTruthy();
  });

  it("fails on a schedule that does not parse", async () => {
    draftWith("schedule", { mode: "sometimes" });

    await expect(service.testTrigger(WORKFLOW, CTX)).rejects.toThrow(
      '"mode" must be "cron" or "interval"',
    );
  });
});

describe("a webhook trigger test", () => {
  it("takes the next delivery as its sample and runs nothing", async () => {
    draftWith("webhook", {
      scheme: "none",
      responseStatus: 202,
    });

    const testing = service.testTrigger(WORKFLOW, CTX);
    await listening();
    const reply = await service.deliverWebhook(delivery({ id: "evt_1" }));

    expect(reply).toEqual({ status: 202 });
    const output = await testing;
    expect(output).toMatchObject({
      method: "POST",
      queryParams: { source: "test" },
      body: { id: "evt_1" },
    });
    expect(await journaledOutput(lastTest()!.runId)).toMatchObject({
      body: { id: "evt_1" },
    });
    expect(fire).not.toHaveBeenCalled();
    // One-shot: the listener is gone, and the unarmed draft refuses again.
    expect(await service.webhookPolicy(WORKFLOW)).toBeUndefined();
  });

  it("verifies the delivery as the draft's trigger would", async () => {
    draftWith("webhook", {
      scheme: "hmac",
      secretRef: "secret://v1:00112233445566778899aabbccddeeff",
    });

    const testing = service.testTrigger(WORKFLOW, CTX);
    await listening();

    expect(await service.webhookPolicy(WORKFLOW)).toMatchObject({
      verify: { scheme: "hmac" },
    });
    service.cancelTriggerTest(WORKFLOW);
    await expect(testing).rejects.toThrow("Trigger test cancelled");
  });

  it("gives up after its timeout and records the failure", async () => {
    draftWith("webhook", { scheme: "none" });

    await expect(
      service.testTrigger(WORKFLOW, CTX, { timeoutMs: 1_000 }),
    ).rejects.toThrow("No webhook delivery arrived within 1s");
    const [row] = await (await service.store())!.getSteps(lastTest()!.runId);
    expect(row).toMatchObject({ status: "FAILED" });
  });

  it("is cancelled by a newer test of the same workflow", async () => {
    draftWith("webhook", { scheme: "none" });

    const first = service.testTrigger(WORKFLOW, CTX);
    await listening();
    const second = service.testTrigger(WORKFLOW, CTX);

    await expect(first).rejects.toThrow(
      "Trigger test superseded by a newer test",
    );
    await listening();
    await service.deliverWebhook(delivery({ id: "evt_2" }));
    expect(await second).toMatchObject({ body: { id: "evt_2" } });
  });

  it("can be cancelled by a caller who may read the workflow", async () => {
    draftWith("webhook", { scheme: "none" });

    const testing = service.testTrigger(WORKFLOW, CTX);
    await listening();

    expect(await service.cancelTriggerTestFor(WORKFLOW, CTX)).toBe(true);
    await expect(testing).rejects.toThrow("Trigger test cancelled");
    expect(await service.cancelTriggerTestFor(WORKFLOW, CTX)).toBe(false);
  });
});
