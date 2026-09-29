// Webhook subscription renewal end to end: a package piece whose WEBHOOK
// trigger renews on a cron, run by the supervisor over the real worker and store.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { sourcedResolver } from "../pieces/index.js";
import { WorkflowRunStore } from "./store.js";
import {
  TriggerSupervisor,
  type PieceTriggerBinding,
} from "./trigger-supervisor.js";

const PIECE = "@acme/piece-expiring-hooks";
const WF = "wf-renew";
const HOOK_URL = "https://example.com/hooks/wf-renew";

// onRenew counts itself in the flow store, and fails while failRenew is set.
const SOURCE = `
export const hooks = {
  displayName: "Expiring Hooks",
  actions: {},
  triggers: {
    event: {
      name: "event",
      displayName: "Event",
      type: "WEBHOOK",
      renewConfiguration: { strategy: "CRON", cronExpression: "0 */6 * * *" },
      props: {},
      onEnable: async (ctx) => {
        await ctx.store.put("enables", ((await ctx.store.get("enables")) ?? 0) + 1);
      },
      onDisable: async () => undefined,
      onRenew: async (ctx) => {
        if (await ctx.store.get("failRenew")) throw new Error("subscription gone");
        await ctx.store.put("renewals", ((await ctx.store.get("renewals")) ?? 0) + 1);
        await ctx.store.put("renewedWith", ctx.webhookUrl);
      },
      run: async (ctx) => (ctx.payload ? [ctx.payload] : []),
    },
    plain: {
      name: "plain",
      displayName: "Plain",
      type: "WEBHOOK",
      renewConfiguration: { strategy: "NONE" },
      props: {},
      onEnable: async () => undefined,
      onDisable: async () => undefined,
      run: async (ctx) => (ctx.payload ? [ctx.payload] : []),
    },
  },
};
`;

const binding = (
  triggerName = "event",
  config: Record<string, unknown> = {},
): PieceTriggerBinding => ({
  workflowId: WF,
  block: {
    pieceName: PIECE,
    pieceVersion: "1.0.0",
    kind: "trigger" as const,
    name: triggerName,
  },
  packageName: PIECE,
  version: "1.0.0",
  triggerName,
  config,
  connectionId: null,
  source: "local",
});

describe("TriggerSupervisor webhook renewal", () => {
  let root = "";
  let store: WorkflowRunStore;
  let clock = new Date("2026-09-29T10:00:00.000Z");
  const supervisors: TriggerSupervisor[] = [];

  const at = (iso: string) => {
    clock = new Date(iso);
  };
  const row = () => store.getTriggerState(WF);
  const flowValue = (key: string) => store.getPieceStoreValue("FLOW", WF, key);

  // A fresh supervisor is a restarted reactor: nothing carried in memory.
  function startSupervisor(): TriggerSupervisor {
    const supervisor = new TriggerSupervisor({
      store: () => Promise.resolve(store),
      resolveAuth: () => Promise.resolve(undefined),
      fire: () => undefined,
      cacheDir: root,
      resolver: sourcedResolver({
        cacheDir: root,
        lookup: (name) =>
          name === PIECE
            ? { name, version: "1.0.0", entryPath: join(root, "hooks.mjs") }
            : undefined,
      }),
      webhookUrlFor: () => Promise.resolve(HOOK_URL),
      // Keeps the reconciliation sweep out of these ticks.
      reconcileIntervalMs: 7 * 24 * 3_600_000,
      now: () => clock,
    });
    supervisors.push(supervisor);
    return supervisor;
  }

  let supervisor: TriggerSupervisor;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "trigger-renew-"));
    await writeFile(join(root, "hooks.mjs"), SOURCE);
    store = await WorkflowRunStore.create(createTestRelationalDb());
    supervisor = startSupervisor();
  });

  afterAll(async () => {
    for (const started of supervisors) started.stop();
    await rm(root, { recursive: true, force: true });
  });

  it("schedules the first renewal on the cron once onEnable succeeds", async () => {
    await supervisor.upsert(binding());
    const state = await row();
    expect(state?.status).toBe("ENABLED");
    expect(state?.next_renew_at).toBe("2026-09-29T12:00:00.000Z");
    expect(await flowValue("enables")).toBe(1);
    expect(await flowValue("renewals")).toBeNull();
  }, 60_000);

  it("waits for the renewal time", async () => {
    at("2026-09-29T11:59:00.000Z");
    await supervisor.tick();
    expect(await flowValue("renewals")).toBeNull();
  }, 60_000);

  it("runs onRenew when due, with the webhook URL, and sets the next slot", async () => {
    at("2026-09-29T12:00:10.000Z");
    await supervisor.tick();
    expect(await flowValue("renewals")).toBe(1);
    expect(await flowValue("renewedWith")).toBe(HOOK_URL);
    const state = await row();
    expect(state?.next_renew_at).toBe("2026-09-29T18:00:00.000Z");
    expect(state?.last_error).toBeNull();
  }, 60_000);

  it("records a failure and backs off without disabling the trigger", async () => {
    await store.setPieceStoreValue("FLOW", WF, "failRenew", true);
    at("2026-09-29T18:00:00.000Z");
    await supervisor.tick();
    let state = await row();
    expect(state?.status).toBe("ENABLED");
    expect(state?.renew_error).toContain("subscription gone");
    expect(state?.renew_failures).toBe(1);
    // The poll's own error and streak are not the renewal's.
    expect(state?.last_error).toBeNull();
    expect(state?.consecutive_failures).toBe(0);
    expect(state?.next_renew_at).toBe("2026-09-29T18:02:00.000Z");

    at("2026-09-29T18:02:00.000Z");
    await supervisor.tick();
    state = await row();
    expect(state?.renew_failures).toBe(2);
    expect(state?.next_renew_at).toBe("2026-09-29T18:06:00.000Z");
    expect(await flowValue("renewals")).toBe(1);
  }, 60_000);

  it("clears its failure once a renewal succeeds", async () => {
    await store.setPieceStoreValue("FLOW", WF, "failRenew", false);
    at("2026-09-29T18:06:00.000Z");
    await supervisor.tick();
    const state = await row();
    expect(await flowValue("renewals")).toBe(2);
    expect(state?.renew_error).toBeNull();
    expect(state?.renew_failures).toBe(0);
    expect(state?.next_renew_at).toBe("2026-09-30T00:00:00.000Z");
  }, 60_000);

  it("never backs a failure off past the next cron slot", async () => {
    await store.setPieceStoreValue("FLOW", WF, "failRenew", true);
    // A long streak: the next retry would be 30 minutes out.
    await store.recordRenewFailure(
      WF,
      "earlier",
      "2026-09-29T23:00:00.000Z",
      "2026-09-29T23:45:00.000Z",
      4,
    );
    at("2026-09-29T23:45:00.000Z");
    await supervisor.tick();
    const state = await row();
    expect(state?.renew_failures).toBe(5);
    expect(state?.next_renew_at).toBe("2026-09-30T00:00:00.000Z");
    await store.setPieceStoreValue("FLOW", WF, "failRenew", false);
  }, 60_000);

  it("picks the persisted renewal up after a restart, overdue or not", async () => {
    supervisor.stop();
    // Down across the 00:00 slot: a recompute from now would skip it.
    at("2026-09-30T00:30:00.000Z");
    supervisor = startSupervisor();
    await supervisor.upsert(binding());
    let state = await row();
    expect(state?.next_renew_at).toBe("2026-09-30T00:00:00.000Z");
    // The streak survives too, so the backoff holds across the restart.
    expect(state?.renew_failures).toBe(5);
    expect(await flowValue("enables")).toBe(2);

    await supervisor.tick();
    expect(await flowValue("renewals")).toBe(3);
    state = await row();
    expect(state?.next_renew_at).toBe("2026-09-30T06:00:00.000Z");
    expect(state?.renew_failures).toBe(0);
  }, 60_000);

  it("recomputes the renewal for a changed config", async () => {
    at("2026-09-30T07:00:00.000Z");
    await store.recordRenewFailure(
      WF,
      "expired",
      "x",
      "2026-09-30T06:00:00.000Z",
      2,
    );
    await supervisor.upsert(binding("event", { changed: true }));
    const state = await row();
    expect(state?.next_renew_at).toBe("2026-09-30T12:00:00.000Z");
    expect(state?.renew_failures).toBe(0);
  }, 60_000);

  const failRenewal = () =>
    store.recordRenewFailure(WF, "expired", "x", "2026-09-30T12:00:00.000Z", 2);
  const expectNoRenewal = async () => {
    const state = await row();
    expect(state?.next_renew_at).toBeNull();
    expect(state?.renew_error).toBeNull();
    expect(state?.renew_failures).toBe(0);
    return state;
  };

  it("drops the renewal when the trigger stops renewing", async () => {
    await failRenewal();
    await supervisor.upsert(binding("plain"));
    expect((await expectNoRenewal())?.status).toBe("ENABLED");
  }, 60_000);

  it("drops the renewal when the trigger is rejected", async () => {
    await supervisor.upsert(binding());
    await failRenewal();
    // A different config: an ENABLED row for the same one is left as it stands.
    await supervisor.reject(WF, binding().block, { v: 2 }, "piece is gone");
    expect((await expectNoRenewal())?.status).toBe("ERROR");
  }, 60_000);

  it("drops the renewal when the workflow is disabled", async () => {
    await supervisor.upsert(binding());
    expect((await row())?.next_renew_at).toBe("2026-09-30T12:00:00.000Z");
    await failRenewal();
    await supervisor.remove(WF);
    expect((await expectNoRenewal())?.status).toBe("DISABLED");

    const renewals = await flowValue("renewals");
    at("2026-09-30T12:00:10.000Z");
    await supervisor.tick();
    expect(await flowValue("renewals")).toBe(renewals);
  }, 60_000);
});
