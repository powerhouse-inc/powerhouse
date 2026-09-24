import {
  isDerivedDocumentId,
  signaturePolicyOf,
} from "@powerhousedao/shared/document-model";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import type * as RenownModule from "../src/renown.js";
import { startSwitchboard } from "../src/server.mjs";

vi.mock("../src/renown.js", async (importOriginal) => ({
  ...(await importOriginal<typeof RenownModule>()),
  initRenown: vi.fn().mockRejectedValue(new Error("Renown is unreachable")),
}));

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

describe("booting Switchboard without Renown", () => {
  it("warns and creates legacy documents, which it can write unsigned", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "switchboard-no-renown-"));
    const previous = process.env.PH_REACTOR_DATABASE_URL;
    process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
    const logger = stubLogger();
    let switchboard: Awaited<ReturnType<typeof startSwitchboard>> | undefined;

    try {
      switchboard = await startSwitchboard({
        workflows: { enabled: false },
        dbPath: join(tempRoot, "read-model"),
        port: 0,
        mcp: false,
        disableLocalPackages: true,
        logger,
      });

      expect(
        logger.warn.mock.calls.some(
          ([message]) =>
            typeof message === "string" &&
            message.includes("new documents are created legacy"),
        ),
      ).toBe(true);

      const document = await switchboard.reactor.createEmpty(
        "powerhouse/document-model",
      );
      expect(signaturePolicyOf(document.header)).toBe("legacy");
      expect(isDerivedDocumentId(document.header.id)).toBe(false);

      const renamed = await switchboard.reactor.rename(
        document.header.id,
        "Renamed",
      );
      expect(renamed.header.name).toBe("Renamed");

      await switchboard.shutdown();
      switchboard = undefined;
    } finally {
      await switchboard?.shutdown();
      if (previous === undefined) {
        delete process.env.PH_REACTOR_DATABASE_URL;
      } else {
        process.env.PH_REACTOR_DATABASE_URL = previous;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60_000);
});
