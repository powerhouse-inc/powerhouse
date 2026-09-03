// Spike S6c as a test: trigger lifecycle over real bundles — a POLLING
// trigger (piece-rss) against a local mutable feed, and a WEBHOOK trigger.
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  buildTriggerContext,
  runTriggerHook,
  TriggerHookNotImplementedError,
} from "../../src/activepieces/context/trigger.js";
import { InMemoryKeyValueStore } from "../../src/activepieces/context/action.js";
import { buildDescriptor } from "../../src/activepieces/descriptor.js";
import { loadPieceFromDir } from "../../src/activepieces/loader.js";
import { getTriggers } from "../../src/activepieces/types.js";
import { fetchBundleForTest } from "./bundle-cache.js";

const rssBundle = await fetchBundleForTest("@activepieces/piece-rss", "0.5.9");
const webhookBundle = await fetchBundleForTest(
  "@activepieces/piece-webhook",
  "0.1.41",
);

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
    `<rss version="2.0"><channel><title>Spike Feed</title>${entries}</channel></rss>`
  );
}

describe.skipIf(!rssBundle || !webhookBundle)(
  "trigger lifecycle (spike S6c)",
  () => {
    let server: http.Server;
    let feedUrl: string;
    let feedItems: FeedItem[];

    beforeAll(async () => {
      feedItems = [
        {
          guid: "g1",
          title: "First",
          pubDate: "Mon, 01 Sep 2026 08:00:00 GMT",
        },
      ];
      server = http.createServer((_req, res) => {
        res.writeHead(200, { "content-type": "application/rss+xml" });
        res.end(renderFeed(feedItems));
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      feedUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/feed.xml`;
    });

    afterAll(async () => {
      await new Promise((resolve) => server.close(resolve));
    });

    it("describes triggers with strategy and props in the descriptor", async () => {
      const { piece } = await loadPieceFromDir(rssBundle);
      const descriptor = buildDescriptor(piece, {
        packageName: "@activepieces/piece-rss",
        version: "0.5.9",
      });
      const newItem = descriptor.triggers.find((t) => t.name === "new-item");
      expect(newItem).toMatchObject({
        strategy: "POLLING",
        testStrategy: "TEST_FUNCTION",
        hasSampleData: true,
      });
      expect(newItem?.props.map((p) => p.name)).toEqual(["rss_feed_url"]);
      expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
    });

    it("polls end-to-end: onEnable seeds the cursor, run emits only new items", async () => {
      const { piece } = await loadPieceFromDir(rssBundle);
      const trigger = getTriggers(piece)["new-item"];
      const store = new InMemoryKeyValueStore();
      const makeHandle = () =>
        buildTriggerContext({
          propsValue: { rss_feed_url: feedUrl },
          store,
        });

      await runTriggerHook(trigger, "onEnable", makeHandle());

      const first = (await runTriggerHook(
        trigger,
        "run",
        makeHandle(),
      )) as unknown[];
      expect(first).toEqual([]);

      feedItems.unshift({
        guid: "g2",
        title: "Second",
        pubDate: "Mon, 01 Sep 2026 09:00:00 GMT",
      });
      const second = (await runTriggerHook(trigger, "run", makeHandle())) as {
        title?: string;
      }[];
      expect(second).toHaveLength(1);
      expect(second[0].title).toBe("Second");

      // Same feed again: the stored cursor suppresses the already-seen item.
      const third = (await runTriggerHook(
        trigger,
        "run",
        makeHandle(),
      )) as unknown[];
      expect(third).toEqual([]);

      await runTriggerHook(trigger, "onDisable", makeHandle());
    }, 30_000);

    it("test() returns current items without consuming the cursor", async () => {
      const { piece } = await loadPieceFromDir(rssBundle);
      const trigger = getTriggers(piece)["new-item"];
      const handle = buildTriggerContext({
        propsValue: { rss_feed_url: feedUrl },
      });
      const items = (await runTriggerHook(trigger, "test", handle)) as {
        title?: string;
      }[];
      expect(items.length).toBeGreaterThan(0);
      expect(items.map((i) => i.title)).toContain("Second");
    }, 30_000);

    it("runs a WEBHOOK trigger with the incoming payload", async () => {
      const { piece } = await loadPieceFromDir(webhookBundle);
      const trigger = getTriggers(piece).catch_webhook;
      expect(trigger.type).toBe("WEBHOOK");

      const payload = {
        body: { hello: "world" },
        headers: { "x-spike": "s6c" },
        queryParams: {},
      };
      const handle = buildTriggerContext({
        propsValue: { authType: "none", authFields: {} },
        payload,
        webhookUrl: "http://localhost:0/hook",
      });
      const out = (await runTriggerHook(trigger, "run", handle)) as unknown[];
      expect(out).toEqual([payload]);
    });

    it("delivers isRepublish and scopes store keys per the AP layout", async () => {
      interface ProbeContext {
        isRepublish: boolean;
        store: {
          put(key: string, value: unknown, scope?: string): Promise<unknown>;
          get(key: string): Promise<unknown>;
        };
      }
      const seen: Record<string, unknown> = {};
      const trigger = {
        name: "probe",
        onEnable: async (raw: unknown) => {
          const ctx = raw as ProbeContext;
          seen.isRepublish = ctx.isRepublish;
          await ctx.store.put("lastPoll", 42);
          await ctx.store.put("shared", "p", "COLLECTION");
          seen.read = await ctx.store.get("lastPoll");
        },
      };
      const store = new InMemoryKeyValueStore();
      await runTriggerHook(
        trigger,
        "onEnable",
        buildTriggerContext({
          propsValue: {},
          store,
          identity: { flowId: "f1" },
          isRepublish: true,
          storePrefix: "test",
        }),
      );
      expect(seen.isRepublish).toBe(true);
      expect(seen.read).toBe(42);
      expect(store.snapshot()).toEqual({
        "testflow_f1/lastPoll": 42,
        testshared: "p",
      });
    });

    it("throws a named error for a missing hook", async () => {
      const { piece } = await loadPieceFromDir(rssBundle);
      const trigger = {
        ...getTriggers(piece)["new-item"],
        onHandshake: undefined,
      };
      await expect(
        runTriggerHook(
          trigger,
          "onHandshake",
          buildTriggerContext({ propsValue: {} }),
        ),
      ).rejects.toBeInstanceOf(TriggerHookNotImplementedError);
    });
  },
);
