import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import {
  RENOWN_SOURCE_IGNORED,
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
  it("has no URLs when nothing is configured", () => {
    const logger = makeLogger();
    expect(resolveRenownConfig(undefined, {}, logger)).toEqual({
      url: undefined,
      switchboardUrl: undefined,
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("reads the config file block", () => {
    expect(
      resolveRenownConfig(
        {
          url: "https://renown.acme.io",
          switchboardUrl: "https://sb.acme.io/graphql",
        },
        {},
        makeLogger(),
      ),
    ).toEqual({
      url: "https://renown.acme.io",
      switchboardUrl: "https://sb.acme.io/graphql",
    });
  });

  it("lets env vars override the config file per field", () => {
    const resolved = resolveRenownConfig(
      {
        url: "https://renown.acme.io",
        switchboardUrl: "https://sb.acme.io/graphql",
      },
      { SWITCHBOARD_URL: "https://sb.env.io/graphql" },
      makeLogger(),
    );
    expect(resolved).toEqual({
      url: "https://renown.acme.io",
      switchboardUrl: "https://sb.env.io/graphql",
    });
  });

  // A blank env var is how empty shell interpolation shows up; it must not
  // silently blank out a configured URL.
  it("treats blank env vars as unset", () => {
    const logger = makeLogger();
    const resolved = resolveRenownConfig(
      { url: "https://renown.acme.io" },
      { RENOWN_SOURCE: "", RENOWN_URL: "   ", SWITCHBOARD_URL: "" },
      logger,
    );
    expect(resolved).toEqual({
      url: "https://renown.acme.io",
      switchboardUrl: undefined,
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("warns that a source setting is no longer read, from env or file", () => {
    for (const [configured, env] of [
      [undefined, { RENOWN_SOURCE: "self" }],
      [{ source: "kept" as const }, {}],
    ] as const) {
      const logger = makeLogger();
      expect(resolveRenownConfig(configured, env, logger)).toEqual({
        url: undefined,
        switchboardUrl: undefined,
      });
      expect(logger.warn).toHaveBeenCalledWith(RENOWN_SOURCE_IGNORED);
    }
  });
});
