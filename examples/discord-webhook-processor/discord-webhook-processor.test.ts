import { createHmac } from "node:crypto";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DiscordWebhookProcessor,
  createDiscordWebhookFactory,
} from "./discord-webhook-processor.js";

const WEBHOOK_URL = "https://discord.com/api/webhooks/123/abc-token";
const SECRET = "test-secret";

function makeOperation(overrides?: {
  actionType?: string;
  documentId?: string;
  documentType?: string;
}): OperationWithContext {
  return {
    operation: {
      id: "op-1",
      index: 0,
      skip: 0,
      timestampUtcMs: "1700000000000",
      hash: "abc123",
      action: {
        id: "action-1",
        type: overrides?.actionType ?? "UPDATE_FIELD",
        timestampUtcMs: "1700000000000",
        input: { field: "value" },
        scope: "global",
      },
    },
    context: {
      documentId: overrides?.documentId ?? "doc-1",
      documentType: overrides?.documentType ?? "powerhouse/billing-statement",
      scope: "global",
      branch: "main",
      ordinal: 1,
    },
  };
}

describe("DiscordWebhookProcessor", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    });
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends operations as Discord embeds", async () => {
    const processor = new DiscordWebhookProcessor(WEBHOOK_URL, SECRET);
    const op = makeOperation();

    await processor.onOperations([op]);

    expect(fetchSpy).toHaveBeenCalledOnce();

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(WEBHOOK_URL);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body);
    expect(body.username).toBe("Reactor");
    expect(body.embeds).toHaveLength(1);

    const embed = body.embeds[0];
    expect(embed.title).toBe("UPDATE_FIELD");
    expect(embed.color).toBe(0x5865f2);
    expect(embed.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Document ID", value: "doc-1" }),
        expect.objectContaining({
          name: "Document Type",
          value: "powerhouse/billing-statement",
        }),
        expect.objectContaining({ name: "Hash", value: "abc123" }),
      ]),
    );
  });

  it("includes valid HMAC-SHA256 signature header", async () => {
    const processor = new DiscordWebhookProcessor(WEBHOOK_URL, SECRET);

    await processor.onOperations([makeOperation()]);

    const [, init] = fetchSpy.mock.calls[0]!;
    const signature = init.headers["X-Reactor-Signature"];
    const expectedSignature = createHmac("sha256", SECRET)
      .update(init.body)
      .digest("hex");

    expect(signature).toBe(expectedSignature);
  });

  it("chunks into multiple requests when >10 operations", async () => {
    const processor = new DiscordWebhookProcessor(WEBHOOK_URL, SECRET);
    const operations = Array.from({ length: 12 }, (_, i) =>
      makeOperation({ documentId: `doc-${i}` }),
    );

    await processor.onOperations(operations);

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(fetchSpy.mock.calls[0]![1].body);
    const secondBody = JSON.parse(fetchSpy.mock.calls[1]![1].body);

    expect(firstBody.embeds).toHaveLength(10);
    expect(secondBody.embeds).toHaveLength(2);
  });

  it("throws on non-ok response", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    });

    const processor = new DiscordWebhookProcessor(WEBHOOK_URL, SECRET);

    await expect(
      processor.onOperations([makeOperation()]),
    ).rejects.toThrowError("Discord webhook failed: 429 Too Many Requests");
  });

  it("onDisconnect resolves without error", async () => {
    const processor = new DiscordWebhookProcessor(WEBHOOK_URL, SECRET);
    await expect(processor.onDisconnect()).resolves.toBeUndefined();
  });
});

describe("createDiscordWebhookFactory", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a factory producing a single ProcessorRecord", () => {
    const factory = createDiscordWebhookFactory({
      webhookUrl: WEBHOOK_URL,
      secret: SECRET,
      filter: {
        documentType: ["powerhouse/billing-statement"],
        scope: ["global"],
        branch: ["main"],
      },
    });

    const records = factory({
      id: "drive-1",
      documentType: "powerhouse/document-drive",
      sig: { publicKey: {}, nonce: "" },
      slug: "",
      name: "",
      branch: "main",
      revision: {},
      createdAtUtcIso: new Date().toISOString(),
      lastModifiedAtUtcIso: new Date().toISOString(),
    });

    expect(records).toHaveLength(1);

    const [record] = records as Awaited<ReturnType<typeof factory>>;
    expect(record!.filter).toEqual({
      documentType: ["powerhouse/billing-statement"],
      scope: ["global"],
      branch: ["main"],
    });
    expect(record!.startFrom).toBe("current");
    expect(record!.processor).toBeInstanceOf(DiscordWebhookProcessor);
  });
});
