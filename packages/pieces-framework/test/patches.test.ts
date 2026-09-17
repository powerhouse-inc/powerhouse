// Regression tests for the literal patches in scripts/sync-upstream.mts.
// upstream/** is generated, so these live here instead (see UPSTREAM.md).
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCustomApiCallAction,
  FetchHttpClient,
  httpClient,
  HttpMethod,
  streamUtils,
} from "../src/common.js";
import {
  ArrayProperty,
  CustomAuthProperty,
  InputProperty,
  Property,
  PropertyType,
} from "../src/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("FetchHttpClient security patches", () => {
  it("never touches process.env.NODE_TLS_REJECT_UNAUTHORIZED", async () => {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("ok", { status: 200 }))),
    );

    await httpClient.sendRequest({
      method: HttpMethod.GET,
      url: "https://example.com/resource",
    });

    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
  });

  it("does not log a failed request (its message embeds the request body)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      return;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("nope", { status: 500 }))),
    );

    await expect(
      new FetchHttpClient().sendRequest({
        method: HttpMethod.POST,
        url: "https://example.com/resource",
        body: { apiKey: "super-secret-token" },
      }),
    ).rejects.toThrow();

    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("streamUtils.readChunks", () => {
  it("rejects a zero chunkSize instead of hanging", async () => {
    const gen = streamUtils.readChunks({
      readable: Readable.from(Buffer.from("abc")),
      chunkSize: 0,
    });
    await expect(gen.next()).rejects.toThrow(/chunkSize/);
  });

  it("rejects a negative chunkSize instead of hanging", async () => {
    const gen = streamUtils.readChunks({
      readable: Readable.from(Buffer.from("abc")),
      chunkSize: -1,
    });
    await expect(gen.next()).rejects.toThrow(/chunkSize/);
  });

  it("rejects a non-integer chunkSize instead of hanging", async () => {
    const gen = streamUtils.readChunks({
      readable: Readable.from(Buffer.from("abc")),
      chunkSize: 1.5,
    });
    await expect(gen.next()).rejects.toThrow(/chunkSize/);
  });

  it("still splits a positive chunkSize normally", async () => {
    const data = Buffer.from(Array.from({ length: 10 }, (_, i) => i));
    const chunks: Buffer[] = [];
    for await (const chunk of streamUtils.readChunks({
      readable: Readable.from(data),
      chunkSize: 4,
    })) {
      chunks.push(chunk);
    }
    expect(chunks.map((c) => c.length)).toEqual([4, 4, 2]);
  });
});

describe("runtime unions widened to match their exported types", () => {
  it("ArrayProperty accepts Json and Color child properties", () => {
    const prop = Property.Array({
      displayName: "Items",
      required: false,
      properties: {
        meta: Property.Json({ displayName: "Meta", required: false }),
        tint: Property.Color({ displayName: "Tint", required: false }),
      },
    });
    expect(() => ArrayProperty.parse(prop)).not.toThrow();
  });

  it("ArrayProperty accepts an absent properties field", () => {
    const prop = Property.Array({ displayName: "Items", required: false });
    expect((prop as { properties?: unknown }).properties).toBeUndefined();
    expect(() => ArrayProperty.parse(prop)).not.toThrow();
  });

  it("InputProperty accepts a Property.Custom value", () => {
    const prop = Property.Custom({
      displayName: "Widget",
      required: false,
      code: () => {
        return;
      },
    });
    expect(() => InputProperty.parse(prop)).not.toThrow();
  });

  it("InputProperty keeps a markdown property's variant instead of stripping it", () => {
    const prop = Property.MarkDown({
      value: "careful",
      variant: "WARNING" as never,
    });
    const parsed = InputProperty.parse(prop) as { variant?: unknown };
    expect(parsed.variant).toBe("WARNING");
  });

  it("CustomAuthProperty accepts secret-text, markdown and static-multi-select props", () => {
    const custom = CustomAuthProperty.parse({
      displayName: "Auth",
      required: true,
      type: PropertyType.CUSTOM_AUTH,
      props: {
        apiKey: {
          displayName: "API key",
          required: true,
          type: PropertyType.SECRET_TEXT,
        },
        note: Property.MarkDown({ value: "read this first" }),
        scopes: {
          displayName: "Scopes",
          required: false,
          type: PropertyType.STATIC_MULTI_SELECT_DROPDOWN,
          options: { options: [{ label: "read", value: "read" }] },
        },
      },
    });
    expect(Object.keys(custom.props)).toEqual(["apiKey", "note", "scopes"]);
  });
});

describe("createCustomApiCallAction authLocation", () => {
  it("puts auth in query params only, not duplicated into headers", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const action = createCustomApiCallAction({
      baseUrl: () => "https://example.com",
      authLocation: "queryParams",
      authMapping: () => Promise.resolve({ api_key: "secret-token" }),
    });

    const ctx = {
      auth: undefined,
      propsValue: {
        method: HttpMethod.GET,
        url: { url: "https://example.com/data" },
        headers: {},
        queryParams: {},
        body: undefined,
        body_type: "none",
        failsafe: false,
        timeout: 0,
        response_is_binary: false,
        followRedirects: false,
      },
      files: { write: () => Promise.resolve("test-file-url") },
    } as unknown as Parameters<typeof action.run>[0];

    await action.run(ctx);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(calledUrl).toContain("api_key=secret-token");
    const headerKeys = Object.keys(init.headers as Record<string, string>);
    expect(headerKeys.map((k) => k.toLowerCase())).not.toContain("api_key");
  });
});
