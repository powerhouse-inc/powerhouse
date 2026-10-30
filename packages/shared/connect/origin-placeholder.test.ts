import { describe, expect, it } from "vitest";
import {
  isHtmlNavigation,
  isOriginPlaceholderUrl,
  isSwitchboardProxyPath,
  ORIGIN_PLACEHOLDER,
  resolveOriginPlaceholders,
  toOriginPlaceholder,
  withOriginPlaceholders,
} from "./origin-placeholder.js";

describe("origin placeholder", () => {
  it("is the ${origin} sugar, recognised at the start of a URL", () => {
    expect(ORIGIN_PLACEHOLDER).toBe("${origin}");
    expect(isOriginPlaceholderUrl("${origin}/graphql")).toBe(true);
    expect(isOriginPlaceholderUrl("${origin}")).toBe(true);
    expect(isOriginPlaceholderUrl("${origin}graphql")).toBe(false);
    expect(isOriginPlaceholderUrl("https://x/${origin}")).toBe(false);
  });

  it("resolves against the page origin, deep, leaving other strings alone", () => {
    const config = {
      connect: {
        drives: { defaultDrives: [{ url: "${origin}/d/sektar", name: null }] },
        composition: [{ config: { drive: "${origin}/d/workflows" } }],
        renown: { switchboardUrl: "${origin}" },
        other: "http://127.0.0.1:2540/keep",
        n: 1,
        none: null,
      },
    };
    const out = resolveOriginPlaceholders(config, "https://app.dev.sektar.be/");
    expect(out.connect.drives.defaultDrives[0].url).toBe(
      "https://app.dev.sektar.be/d/sektar",
    );
    expect(out.connect.composition[0].config.drive).toBe(
      "https://app.dev.sektar.be/d/workflows",
    );
    expect(out.connect.renown.switchboardUrl).toBe("https://app.dev.sektar.be");
    expect(out.connect.other).toBe("http://127.0.0.1:2540/keep");
    expect(out.connect.n).toBe(1);
    expect(out.connect.none).toBeNull();
    // the input is not mutated
    expect(config.connect.drives.defaultDrives[0].url).toBe(
      "${origin}/d/sektar",
    );
  });

  it("writes a proxied origin's URLs against the placeholder, loopback spellings alike", () => {
    const sb = "http://127.0.0.1:7540";
    expect(toOriginPlaceholder("http://127.0.0.1:7540/d/sektar", sb)).toBe(
      "${origin}/d/sektar",
    );
    expect(toOriginPlaceholder("http://localhost:7540/graphql?x=1#f", sb)).toBe(
      "${origin}/graphql?x=1#f",
    );
    expect(toOriginPlaceholder("http://[::1]:7540/", sb)).toBe("${origin}/");
    expect(toOriginPlaceholder("http://127.0.0.1:2540/d/x", sb)).toBe(
      "http://127.0.0.1:2540/d/x",
    );
    expect(toOriginPlaceholder("https://127.0.0.1:7540/d/x", sb)).toBe(
      "https://127.0.0.1:7540/d/x",
    );
    expect(
      toOriginPlaceholder(
        "https://sb.example.com/d/x",
        "https://sb.example.com",
      ),
    ).toBe("${origin}/d/x");
    expect(toOriginPlaceholder("not a url", sb)).toBe("not a url");
    expect(toOriginPlaceholder("http://127.0.0.1:7540/d/x", "nope")).toBe(
      "http://127.0.0.1:7540/d/x",
    );
  });

  it("rewrites a whole config and resolves back to the same shape", () => {
    const served = {
      drives: { defaultDrives: [{ url: "http://127.0.0.1:7540/d/sektar" }] },
      composition: [{ config: { drive: "http://localhost:7540/d/workflows" } }],
      packageRegistryUrl: "https://registry.dev.vetra.io",
    };
    const placeholders = withOriginPlaceholders(
      served,
      "http://localhost:7540",
    );
    expect(placeholders.drives.defaultDrives[0].url).toBe("${origin}/d/sektar");
    expect(placeholders.composition[0].config.drive).toBe(
      "${origin}/d/workflows",
    );
    expect(placeholders.packageRegistryUrl).toBe(
      "https://registry.dev.vetra.io",
    );
    expect(
      resolveOriginPlaceholders(placeholders, "http://localhost:2540"),
    ).toEqual({
      ...served,
      drives: { defaultDrives: [{ url: "http://localhost:2540/d/sektar" }] },
      composition: [{ config: { drive: "http://localhost:2540/d/workflows" } }],
    });
  });

  it("names the switchboard's paths, and a browser navigation", () => {
    for (const p of [
      "/graphql",
      "/graphql/portle",
      "/d/sektar",
      "/d/sektar/graphql",
      "/attachments/abc",
      "/mcp",
      "/api/x/y",
    ]) {
      expect(isSwitchboardProxyPath(p), p).toBe(true);
    }
    for (const p of [
      "/",
      "/productivity",
      "/dx",
      "/graphqlx",
      "/ready",
      "/health",
      "/api",
      "/d",
    ]) {
      expect(isSwitchboardProxyPath(p), p).toBe(false);
    }
    expect(isHtmlNavigation("text/html,application/xhtml+xml")).toBe(true);
    expect(isHtmlNavigation("application/json")).toBe(false);
    expect(isHtmlNavigation(undefined)).toBe(false);
  });
});
