// Supervisor over a real PGlite-backed store and the real worker + rss piece:
// enable/poll/fire/disable, error backoff, and the zombie-row guard.
import { getDbClient } from "@powerhousedao/reactor-api";
import { fetchPieceBundle } from "@powerhousedao/reactor-connectors";
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
const CURSOR_KEY = `flow_${WF}/lastItem`;
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

    const { db } = getDbClient();
    store = await WorkflowRunStore.create(createRelationalDb(db));
    fired = [];
    supervisor = new TriggerSupervisor({
      store: () => Promise.resolve(store),
      resolveAuth: () => Promise.resolve(undefined),
      fire: (workflowId, payload, kind) => {
        fired.push({ workflowId, payload, kind });
      },
      cacheDir,
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
      (JSON.parse(row!.store_state) as Record<string, unknown>)[CURSOR_KEY],
    ).toBe("g1");
    expect(Date.parse(row!.next_poll_at!)).toBeGreaterThan(Date.now());
  }, 60_000);

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
      (JSON.parse(row!.store_state) as Record<string, unknown>)[CURSOR_KEY],
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

  it("marks a failed onEnable as ERROR and does not schedule polls", async () => {
    broken = true;
    const changed = {
      ...binding(),
      workflowId: "wf-sup-err",
      config: { rss_feed_url: `${feedUrl}?v=err` },
    };
    await supervisor.upsert(changed);
    const row = await store.getTriggerState("wf-sup-err");
    expect(row?.status).toBe("ERROR");
    expect(row?.next_poll_at).toBeNull();
    expect(row?.last_error).toBeTruthy();
    broken = false;
  }, 60_000);

  it("disables on remove and keeps the cursor for a later republish", async () => {
    await supervisor.remove(WF);
    const row = await store.getTriggerState(WF);
    expect(row?.status).toBe("DISABLED");
    expect(
      (JSON.parse(row!.store_state) as Record<string, unknown>)[CURSOR_KEY],
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
    });
    await forceDue();
    await orphaned.tick();
    const row = await store.getTriggerState(WF);
    expect(row?.status).toBe("DISABLED");
    orphaned.stop();
  }, 60_000);

  it("claims dedupe keys once within the TTL", async () => {
    const now = new Date().toISOString();
    expect(await store.claimDedupe(WF, "k1", 30_000, now)).toBe(true);
    expect(await store.claimDedupe(WF, "k1", 30_000, now)).toBe(false);
    const later = new Date(Date.now() + 60_000).toISOString();
    expect(await store.claimDedupe(WF, "k1", 30_000, later)).toBe(true);
  });
});

describe("interval parsing", () => {
  it("honours */N minute crons with a 60s floor and falls back otherwise", () => {
    expect(intervalFromSchedules(undefined, 300_000)).toBe(300_000);
    expect(
      intervalFromSchedules([{ cronExpression: "*/2 * * * *" }], 300_000),
    ).toBe(120_000);
    expect(
      intervalFromSchedules([{ cronExpression: "0 3 * * 1" }], 300_000),
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
