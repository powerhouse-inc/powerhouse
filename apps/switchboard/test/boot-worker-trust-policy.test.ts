import type { ILogger } from "document-model";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as RenownModule from "../src/renown.js";
import { bootSwitchboard } from "./boot-helpers.js";

vi.mock("../src/renown.js", async (importOriginal) => ({
  ...(await importOriginal<typeof RenownModule>()),
  initRenown: vi.fn().mockRejectedValue(new Error("Renown is unreachable")),
}));

const ENV_KEYS = [
  "PH_REACTOR_DATABASE_URL",
  "RENOWN_SOURCE",
  "REACTOR_DOCUMENT_DECISIONS",
  "REACTOR_AUTH_ENFORCEMENT",
] as const;

function stubLogger(): ILogger & { warn: ReturnType<typeof vi.fn> } {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as ILogger & { warn: ReturnType<typeof vi.fn> };
}

describe("booting with pooled workers under authEnforcement", () => {
  let tempRoot: string;
  let previous: Partial<Record<(typeof ENV_KEYS)[number], string>>;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "switchboard-worker-trust-"));
    previous = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
    process.env.REACTOR_DOCUMENT_DECISIONS = "true";
    process.env.REACTOR_AUTH_ENFORCEMENT = "true";
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
    await rm(tempRoot, { recursive: true, force: true });
  });

  // Workers ask Renown at its URL, so no credential source keeps them out:
  // Postgres is the next requirement a pooled boot has.
  it.each(["self", "kept", "remote"])(
    "passes the trust check with RENOWN_SOURCE=%s, which it says it ignores",
    async (source) => {
      process.env.RENOWN_SOURCE = source;
      const logger = stubLogger();
      await expect(
        bootSwitchboard(
          {
            server: { port: 0 },
            storage: { readModel: { url: join(tempRoot, "read-model") } },
            features: { workflows: false, mcp: false },
            packages: { disableLocal: true },
            workers: { executor: { count: 2 } },
          },
          { logger },
        ),
      ).rejects.toThrow(/requires a Postgres/);
      expect(
        logger.warn.mock.calls.some(([message]) =>
          String(message).includes("RENOWN_SOURCE"),
        ),
      ).toBe(true);
    },
  );
});
