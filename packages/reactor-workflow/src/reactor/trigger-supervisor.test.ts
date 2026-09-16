// Supervisor over a real PGlite-backed store and the real worker + rss piece:
// enable/poll/fire/disable, error backoff, and the zombie-row guard.
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { fetchPieceBundle } from "../pieces/index.js";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkflowRunStore } from "./store.js";
import {
  TriggerSupervisor,
  configHash,
  intervalFromSchedules,
} from "./trigger-supervisor.js";

const cacheDir = fileURLToPath(
  new URL("../../node_modules/.cache/ap-bundles/", import.meta.url),
);

let rssBundle = "";
try {
  const bundle = await fetchPieceBundle({
    name: "@activepieces/piece-rss",
    version: "0.5.9",
    cacheDir,
  });
  rssBundle = bundle.dir;
} catch {
  // offline: suite skips
}

interface FeedItem {
  guid: string;
  title: string;
  pubDate: string;
}

function renderFeed(items: FeedItem[]): string {
  const entries = items
    .map(
      (i) =>
        `<item><guid>${i.guid}</guid><title>${i.title}</title>` +
        `<pubDate>${i.pubDate}</pubDate></item>`,
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0"><channel><title>Sup Feed</title>${entries}</channel></rss>`
  );
}

const WF = "wf-sup-1";
const CURSOR_KEY = "lastItem";
const PAST = "2000-01-01T00:00:00.000Z";

describe.skipIf(!rssBundle)("TriggerSupervisor", () => {
  let server: http.Server;
  let feedUrl: string;
  let feedItems: FeedItem[];
  let broken = false;
  let store: WorkflowRunStore;
  let supervisor: TriggerSupervisor;
  let fired: { workflowId: string; payload: unknown; kind: string }[];

  const binding = () => ({
    workflowId: WF,
    blockType: "@activepieces/piece-rss@0.5.9#trigger:new-item",
    packageName: "@activepieces/piece-rss",
    version: "0.5.9",
    triggerName: "new-item",
    config: { rss_feed_url: feedUrl },
    connectionId: null,
  });

  // Rewinds next_poll_at so the next tick treats the row as due.
  const forceDue = async () => {
    const row = await store.getTriggerState(WF);
    await store.upsertTriggerState({ ...row!, next_poll_at: PAST });
  };

  beforeAll(async () => {
    feedItems = [
      { guid: "g1", title: "First", pubDate: "Mon, 01 Sep 2026 08:00:00 GMT" },
    ];
    server = http.createServer((_req, res) => {
      if (broken) {
        res.writeHead(500);
        res.end("boom");
        return;
      }
      res.writeHead(200, { "content-type": "application/rss+xml" });
      res.end(renderFeed(feedItems));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    feedUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/feed.xml`;

    store = await WorkflowRunStore.create(createTestRelationalDb());
    fired = [];
    supervisor = new TriggerSupervisor({
      store: () => Promise.resolve(store),
      resolveAuth: () => Promise.resolve(undefined),
      fire: (workflowId, payload, kind) => {
        fired.push({ workflowId, payload, kind });
      },
      cacheDir,
      // The feed is on loopback, which the default policy refuses.
      egress: { allowAddresses: ["127.0.0.1/32", "::1/128"] },
    });
  }, 60_000);

  afterAll(async () => {
    supervisor.stop();
    await new Promise((resolve) => server.close(resolve));
  });

  it("enables: onEnable seeds the cursor and schedules the first poll", async () => {
    await supervisor.upsert(binding());
    const row = await store.getTriggerState(WF);
    expect(row?.status).toBe("ENABLED");
    expect(row?.interval_ms).toBe(300_000);
    expect(
      await store.getPieceStoreValue("FLOW", WF, CURSOR_KEY),
    ).toBe("g1");
    expect(Date.parse(row!.next_poll_at!)).toBeGreaterThan(Date.now());
  }, 60_000);

  it("skips identical re-registrations without re-running onEnable", async () => {
    const before = await store.getTriggerState(WF);
    await supervisor.upsert(binding());
    const after = await store.getTriggerState(WF);
    expect(after?.next_poll_at).toBe(before?.next_poll_at);
    expect(after?.updated_at).toBe(before?.updated_at);
  });

  it("polls due rows and fires one run per new item", async () => {
    await forceDue();
    await supervisor.tick();
    expect(fired).toEqual([]);

    feedItems.unshift({
      guid: "g2",
      title: "Second",
      pubDate: "Mon, 01 Sep 2026 09:00:00 GMT",
    });
    await forceDue();
    await supervisor.tick();
    expect(fired).toHaveLength(1);
    expect(fired[0].kind).toBe(
      "piece:@activepieces/piece-rss@0.5.9#trigger:new-item",
    );
    expect((fired[0].payload as { title?: string }).title).toBe("Second");

    const row = await store.getTriggerState(WF);
    expect(
      await store.getPieceStoreValue("FLOW", WF, CURSOR_KEY),
    ).toBe("g2");
    expect(row?.consecutive_failures).toBe(0);
    expect(Date.parse(row!.next_poll_at!)).toBeGreaterThan(Date.now());
  }, 60_000);

  it("backs off on poll failure without disabling", async () => {
    broken = true;
    await forceDue();
    await supervisor.tick();
    const row = await store.getTriggerState(WF);
    expect(row?.status).toBe("ENABLED");
    expect(row?.consecutive_failures).toBe(1);
    expect(row?.last_error).toBeTruthy();
    // Backoff doubles the base interval on the first failure.
    expect(Date.parse(row!.next_poll_at!)).toBeGreaterThan(
      Date.now() + row!.interval_ms,
    );
    expect(fired).toHaveLength(1);
    broken = false;
  }, 60_000);

  it("recovers on the next successful poll", async () => {
    await forceDue();
    await supervisor.tick();
    const row = await store.getTriggerState(WF);
    expect(row?.consecutive_failures).toBe(0);
    expect(row?.last_error).toBeNull();
  }, 60_000);

  it("marks a failed onEnable as ERROR and schedules a retry", async () => {
    broken = true;
    const changed = {
      ...binding(),
      workflowId: "wf-sup-err",
      config: { rss_feed_url: `${feedUrl}?v=err` },
    };
    await supervisor.upsert(changed);
    const row = await store.getTriggerState("wf-sup-err");
    expect(row?.status).toBe("ERROR");
    expect(row?.last_error).toBeTruthy();
    expect(row?.consecutive_failures).toBe(1);
    // Backed off, not parked: the trigger comes back on its own.
    expect(Date.parse(row!.next_poll_at!)).toBeGreaterThan(Date.now());
    broken = false;
  }, 60_000);

  it("disables on remove and keeps the cursor for a later republish", async () => {
    await supervisor.remove(WF);
    const row = await store.getTriggerState(WF);
    expect(row?.status).toBe("DISABLED");
    expect(
      await store.getPieceStoreValue("FLOW", WF, CURSOR_KEY),
    ).toBe("g2");

    await store.upsertTriggerState({ ...row!, next_poll_at: PAST });
    await supervisor.tick();
    // DISABLED rows are never due.
    expect(fired).toHaveLength(1);
  }, 60_000);

  it("disables zombie rows whose workflow left the registry", async () => {
    await supervisor.upsert(binding());
    const orphaned = new TriggerSupervisor({
      store: () => Promise.resolve(store),
      resolveAuth: () => Promise.resolve(undefined),
      fire: () => undefined,
      cacheDir,
      egress: { allowAddresses: ["127.0.0.1/32", "::1/128"] },
    });
    await forceDue();
    await orphaned.tick();
    const row = await store.getTriggerState(WF);
    expect(row?.status).toBe("DISABLED");
    orphaned.stop();
  }, 60_000);

  // pollingHelper advances its cursor inside the hook, so a delivery that
  // fails afterwards would skip those items forever without the rewind.
  it("rewinds the cursor when delivery fails after the hook checkpointed", async () => {
    const flaky = "wf-sup-rewind";
    let explode = false;
    const delivered: unknown[] = [];
    const supervisor2 = new TriggerSupervisor({
      store: () => Promise.resolve(store),
      resolveAuth: () => Promise.resolve(undefined),
      fire: (_workflowId, payload) => {
        if (explode) throw new Error("delivery sink is down");
        delivered.push(payload);
      },
      cacheDir,
      // The feed is on loopback, which the default policy refuses.
      egress: { allowAddresses: ["127.0.0.1/32", "::1/128"] },
    });
    const flakyBinding = { ...binding(), workflowId: flaky };
    await supervisor2.upsert(flakyBinding);
    const seeded = await store.getPieceStoreValue("FLOW", flaky, CURSOR_KEY);

    feedItems.unshift({
      guid: "g-rewind",
      title: "Rewound",
      pubDate: "Tue, 02 Sep 2026 08:00:00 GMT",
    });
    explode = true;
    const row = await store.getTriggerState(flaky);
    await store.upsertTriggerState({ ...row!, next_poll_at: PAST });
    await supervisor2.tick();

    // The hook did advance it, and the failed poll put it back.
    expect(await store.getPieceStoreValue("FLOW", flaky, CURSOR_KEY)).toBe(
      seeded,
    );
    expect(delivered).toEqual([]);
    expect((await store.getTriggerState(flaky))?.consecutive_failures).toBe(1);

    // At-least-once: the next poll re-reads the item it never delivered.
    explode = false;
    const failed = await store.getTriggerState(flaky);
    await store.upsertTriggerState({ ...failed!, next_poll_at: PAST });
    await supervisor2.tick();
    expect((delivered as { title?: string }[]).map((i) => i.title)).toEqual([
      "Rewound",
    ]);
    supervisor2.stop();
  }, 60_000);

  it("clears the store when the config changes, keeping it on a republish", async () => {
    const changed = "wf-sup-reconfig";
    await supervisor.upsert({ ...binding(), workflowId: changed });
    await store.setPieceStoreValue("FLOW", changed, "_webhook_id", 1234);

    // An unchanged re-registration is a republish and keeps everything.
    await supervisor.upsert({ ...binding(), workflowId: changed });
    expect(
      await store.getPieceStoreValue("FLOW", changed, "_webhook_id"),
    ).toBe(1234);

    // A different config is a different trigger: the old registration id must
    // not survive into it, or onDisable would later free the wrong endpoint.
    await supervisor.upsert({
      ...binding(),
      workflowId: changed,
      config: { rss_feed_url: `${feedUrl}?v=2` },
    });
    expect(
      await store.getPieceStoreValue("FLOW", changed, "_webhook_id"),
    ).toBeNull();
  }, 60_000);

  it("runs a sample in its own partition and leaves nothing behind", async () => {
    const sampled = "wf-sup-sample";
    await supervisor.upsert({ ...binding(), workflowId: sampled });
    const live = await store.getPieceStoreValue("FLOW", sampled, CURSOR_KEY);

    const out = await supervisor.test({ ...binding(), workflowId: sampled });
    expect(Array.isArray(out)).toBe(true);
    // The live cursor is untouched, and the sample's partition is gone — not
    // merely named apart, as a key prefix would have left it.
    expect(await store.getPieceStoreValue("FLOW", sampled, CURSOR_KEY)).toBe(
      live,
    );
    expect(await store.listPieceStore("FLOW", `${sampled}#test`)).toEqual({});
  }, 60_000);

  // A webhook `run` checkpoints its cursor inside the hook just as a poll
  // does, so a malformed output has to fail rather than read as "no items".
  it("rejects a non-array webhook run instead of swallowing the delivery", async () => {
    const scalar = "wf-sup-scalar";
    const advanced = "g-after-webhook";
    const worker = {
      describePiece: () =>
        Promise.resolve({
          output: {
            triggers: [{ name: "new-item", strategy: "WEBHOOK" }],
          },
          touched: [],
          tlsPoisoned: false,
        }),
      runTriggerHook: async (request: { hook: string }) => {
        if (request.hook === "run") {
          // What pollingHelper does before it returns: the cursor moves first.
          await store.setPieceStoreValue("FLOW", scalar, CURSOR_KEY, advanced);
          return { output: "one item", touched: [], tlsPoisoned: false };
        }
        return { output: [], touched: [], tlsPoisoned: false };
      },
      dispose: () => undefined,
    };
    const supervisor3 = new TriggerSupervisor({
      store: () => Promise.resolve(store),
      resolveAuth: () => Promise.resolve(undefined),
      fire: () => undefined,
      cacheDir,
      worker: worker as unknown as ConstructorParameters<
        typeof TriggerSupervisor
      >[0]["worker"],
      webhookUrlFor: () => Promise.resolve("https://reactor.test/hook"),
    });
    await supervisor3.upsert({ ...binding(), workflowId: scalar });
    await store.setPieceStoreValue("FLOW", scalar, CURSOR_KEY, "g-before");

    await expect(supervisor3.deliverWebhook(scalar, { id: 1 })).rejects.toThrow(
      /expected an array/,
    );
    // Coercing to no items would have left the advanced cursor standing, and
    // the event behind it could never be read again.
    expect(await store.getPieceStoreValue("FLOW", scalar, CURSOR_KEY)).toBe(
      "g-before",
    );
    supervisor3.stop();
  }, 60_000);

  it("claims dedupe keys once within the TTL", async () => {
    const now = new Date().toISOString();
    expect(await store.claimDedupe(WF, "k1", 30_000, now)).toBe(true);
    expect(await store.claimDedupe(WF, "k1", 30_000, now)).toBe(false);
    const later = new Date(Date.now() + 60_000).toISOString();
    expect(await store.claimDedupe(WF, "k1", 30_000, later)).toBe(true);
  });
});

describe("TriggerSupervisor without a journal", () => {
  const binding = {
    workflowId: "wf-no-journal",
    blockType: "@activepieces/piece-rss@0.5.9#trigger:new-item",
    packageName: "@activepieces/piece-rss",
    version: "0.5.9",
    triggerName: "new-item",
    config: { rss_feed_url: "http://127.0.0.1:1/feed.xml" },
    connectionId: null,
  };

  const supervisor = () =>
    new TriggerSupervisor({
      store: () => Promise.resolve(undefined),
      resolveAuth: () => Promise.resolve(undefined),
      fire: () => undefined,
      cacheDir,
    });

  // Degrading to the heap would reset the cursor on every restart and
  // re-deliver the trigger's whole history, so a live hook refuses instead.
  it("refuses a live hook rather than running it on the heap", async () => {
    await expect(
      supervisor().handshake(binding, { probe: true }),
    ).rejects.toThrow(/needs a run journal/);
  });

  it("still answers a design-time sample, whose state is throwaway", async () => {
    // Reaches the bundle fetch, which is as far as a journal-less reactor can
    // get; what matters is that it is not the refusal above.
    await expect(supervisor().test(binding)).rejects.not.toThrow(
      /needs a run journal/,
    );
  }, 60_000);
});

describe("interval parsing", () => {
  it("derives the cadence from any cron with a 60s floor, falling back when unparseable", () => {
    expect(intervalFromSchedules(undefined, 300_000)).toBe(300_000);
    expect(
      intervalFromSchedules([{ cronExpression: "*/2 * * * *" }], 300_000),
    ).toBe(120_000);
    expect(
      intervalFromSchedules([{ cronExpression: "0 * * * *" }], 300_000),
    ).toBe(3_600_000);
    expect(
      intervalFromSchedules([{ cronExpression: "0 3 * * 1" }], 300_000),
    ).toBe(7 * 86_400_000);
    expect(
      intervalFromSchedules([{ cronExpression: "not a cron" }], 300_000),
    ).toBe(300_000);
    expect(intervalFromSchedules(undefined, 10_000)).toBe(60_000);
  });

  it("hashes blockType and config together", () => {
    const a = configHash("x#trigger:t", { url: "a" });
    expect(a).toBe(configHash("x#trigger:t", { url: "a" }));
    expect(a).not.toBe(configHash("x#trigger:t", { url: "b" }));
    expect(a).not.toBe(configHash("y#trigger:t", { url: "a" }));
  });
});
