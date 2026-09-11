// Trigger hooks with no journal behind them: the piece store round-trips as
// storeState, so cursors survive worker death and isRepublish keeps them.

// The durable path that replaces this wherever a journal exists lives in
// worker-trigger-store.test.ts.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { PieceWorker } from "../../src/activepieces/worker/host.js";
import { fetchBundleForTest } from "./bundle-cache.js";

const rssBundle = await fetchBundleForTest("@activepieces/piece-rss", "0.5.9");

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
    `<rss version="2.0"><channel><title>Worker Feed</title>${entries}</channel></rss>`
  );
}

const CURSOR_KEY = "flow_wf-1/lastItem";

describe.skipIf(!rssBundle)("PieceWorker trigger hooks", () => {
  let server: http.Server;
  let feedUrl: string;
  let feedItems: FeedItem[];
  let worker: PieceWorker;

  const hook = (
    name: "onEnable" | "onDisable" | "run" | "test",
    storeState: Record<string, unknown>,
    isRepublish?: boolean,
  ) =>
    worker.runTriggerHook(
      {
        bundleDir: rssBundle,
        triggerName: "new-item",
        hook: name,
        propsValue: { rss_feed_url: feedUrl },
        storeState,
        identity: { flowId: "wf-1" },
        isRepublish,
      },
      { timeoutMs: 30_000 },
    );

  beforeAll(async () => {
    feedItems = [
      { guid: "g1", title: "First", pubDate: "Mon, 01 Sep 2026 08:00:00 GMT" },
    ];
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/rss+xml" });
      res.end(renderFeed(feedItems));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    feedUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/feed.xml`;
    worker = new PieceWorker();
  });

  afterAll(async () => {
    worker.dispose();
    await new Promise((resolve) => server.close(resolve));
  });

  it("keeps the cursor across worker death via the storeState round-trip", async () => {
    const enabled = await hook("onEnable", {});
    expect(enabled.storeState?.[CURSOR_KEY]).toBe("g1");
    let persisted = enabled.storeState!;

    const first = await hook("run", persisted);
    expect(first.output).toEqual([]);
    persisted = first.storeState!;

    feedItems.unshift({
      guid: "g2",
      title: "Second",
      pubDate: "Mon, 01 Sep 2026 09:00:00 GMT",
    });
    const second = await hook("run", persisted);
    expect((second.output as { title?: string }[]).map((i) => i.title)).toEqual(
      ["Second"],
    );
    persisted = second.storeState!;
    expect(persisted[CURSOR_KEY]).toBe("g2");

    // Kill the worker between polls; the next hook spawns a fresh child.
    worker.dispose();
    const afterCrash = await hook("run", persisted);
    expect(afterCrash.output).toEqual([]);

    feedItems.unshift({
      guid: "g3",
      title: "Third",
      pubDate: "Mon, 01 Sep 2026 10:00:00 GMT",
    });
    const third = await hook("run", afterCrash.storeState!);
    expect((third.output as { title?: string }[]).map((i) => i.title)).toEqual([
      "Third",
    ]);
  }, 120_000);

  // rss@0.5.9 drops isRepublish when calling pollingHelper, so re-enable
  // reseeds to the feed head either way — matching upstream AP for this piece.
  it("onEnable reseeds the cursor to the feed head on re-enable", async () => {
    const stale = { [CURSOR_KEY]: "g1" };
    const republished = await hook("onEnable", stale, true);
    expect(republished.storeState?.[CURSOR_KEY]).toBe("g3");

    const reenabled = await hook("onEnable", stale, false);
    expect(reenabled.storeState?.[CURSOR_KEY]).toBe("g3");
  }, 60_000);

  it("resolve-options reaches trigger props via kind", async () => {
    // rss_feed_url is static: the trigger lookup succeeds, the resolver check
    // fails — proving kind routes to triggers, not actions.
    await expect(
      worker.resolveOptions({
        bundleDir: rssBundle,
        actionName: "new-item",
        kind: "trigger",
        propName: "rss_feed_url",
      }),
    ).rejects.toThrow(/no dynamic resolver/);
    await expect(
      worker.resolveOptions({
        bundleDir: rssBundle,
        actionName: "new-item",
        propName: "rss_feed_url",
      }),
    ).rejects.toThrow(/No action "new-item"/);
  }, 60_000);

  it("test hooks never touch the live cursor", async () => {
    const persisted = { [CURSOR_KEY]: "g2" };
    const result = await hook("test", persisted);
    expect((result.output as unknown[]).length).toBeGreaterThan(0);
    expect(result.storeState?.[CURSOR_KEY]).toBe("g2");
  }, 60_000);
});
