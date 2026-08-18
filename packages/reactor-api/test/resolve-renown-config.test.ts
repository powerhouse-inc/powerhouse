import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import {
  assertCredentialVerifierForSource,
  resolveRenownConfig,
} from "../src/services/renown-config.js";

function makeLogger(): ILogger {
  const logger = {
    level: "error" as const,
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    errorHandler: vi.fn(),
    child: () => logger,
  };
  return logger as unknown as ILogger;
}

describe("resolveRenownConfig", () => {
  it("defaults to remote with no URLs when nothing is configured", () => {
    expect(resolveRenownConfig(undefined, {}, makeLogger())).toEqual({
      source: "remote",
      url: undefined,
      switchboardUrl: undefined,
    });
  });

  it("reads the config file block", () => {
    expect(
      resolveRenownConfig(
        {
          source: "self",
          url: "https://renown.acme.io",
          switchboardUrl: "https://sb.acme.io/graphql",
        },
        {},
        makeLogger(),
      ),
    ).toEqual({
      source: "self",
      url: "https://renown.acme.io",
      switchboardUrl: "https://sb.acme.io/graphql",
    });
  });

  it("lets env vars override the config file per field", () => {
    const resolved = resolveRenownConfig(
      {
        source: "self",
        url: "https://renown.acme.io",
        switchboardUrl: "https://sb.acme.io/graphql",
      },
      {
        RENOWN_SOURCE: "remote",
        SWITCHBOARD_URL: "https://sb.env.io/graphql",
      },
      makeLogger(),
    );
    expect(resolved).toEqual({
      source: "remote",
      url: "https://renown.acme.io",
      switchboardUrl: "https://sb.env.io/graphql",
    });
  });

  // A blank env var is how empty shell interpolation shows up; it must not
  // silently blank out a configured URL.
  it("treats blank env vars as unset", () => {
    const resolved = resolveRenownConfig(
      { source: "self", url: "https://renown.acme.io" },
      { RENOWN_SOURCE: "", RENOWN_URL: "   ", SWITCHBOARD_URL: "" },
      makeLogger(),
    );
    expect(resolved).toEqual({
      source: "self",
      url: "https://renown.acme.io",
      switchboardUrl: undefined,
    });
  });

  it("falls back to remote on an unrecognised source and warns", () => {
    const logger = makeLogger();
    const resolved = resolveRenownConfig(
      undefined,
      { RENOWN_SOURCE: "local" },
      logger,
    );
    expect(resolved.source).toBe("remote");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring invalid renown source "local"'),
    );
  });

  // `url` doubles as the instance this reactor's own identity uses, so it is
  // kept even when credentials are verified locally.
  it("keeps the URL when the source is self", () => {
    expect(
      resolveRenownConfig(
        { source: "self", url: "https://renown.acme.io" },
        {},
        makeLogger(),
      ).url,
    ).toBe("https://renown.acme.io");
  });
});

describe("assertCredentialVerifierForSource", () => {
  it("passes for remote with or without a host verifier", () => {
    expect(() =>
      assertCredentialVerifierForSource("remote", false),
    ).not.toThrow();
    expect(() =>
      assertCredentialVerifierForSource("remote", true),
    ).not.toThrow();
  });

  it("passes for self when the host supplied a verifier", () => {
    expect(() => assertCredentialVerifierForSource("self", true)).not.toThrow();
  });

  // Core cannot build this verifier itself: it has no idea which subgraph
  // serves the read model. Refuse rather than silently verify remotely.
  it("refuses self without a host verifier", () => {
    expect(() => assertCredentialVerifierForSource("self", false)).toThrow(
      /verifyCredential/,
    );
  });
});
