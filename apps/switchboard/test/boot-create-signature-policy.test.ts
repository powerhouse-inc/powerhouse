import {
  hasDerivedDocumentId,
  isDerivedDocumentId,
  signaturePolicyOf,
} from "@powerhousedao/shared/document-model";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import { startSwitchboard } from "../src/server.mjs";

function stubLogger(): ILogger {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as ILogger;
}

async function withSwitchboard(
  env: Record<string, string>,
  run: (
    switchboard: Awaited<ReturnType<typeof startSwitchboard>>,
  ) => Promise<void>,
): Promise<void> {
  const tempRoot = await mkdtemp(join(tmpdir(), "switchboard-create-policy-"));
  const names = ["PH_REACTOR_DATABASE_URL", ...Object.keys(env)];
  const previous = names.map((name) => [name, process.env[name]] as const);
  process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
  Object.assign(process.env, env);
  let switchboard: Awaited<ReturnType<typeof startSwitchboard>> | undefined;

  try {
    switchboard = await startSwitchboard({
      workflows: { enabled: false },
      dbPath: join(tempRoot, "read-model"),
      port: 0,
      mcp: false,
      disableLocalPackages: true,
      identity: { keypairPath: join(tempRoot, "identity.json") },
      drive: {
        slug: "default-drive",
        global: { name: "Default Drive" },
      },
      logger: stubLogger(),
    });
    await run(switchboard);
    await switchboard.shutdown();
    switchboard = undefined;
  } finally {
    await switchboard?.shutdown();
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    await rm(tempRoot, { recursive: true, force: true });
  }
}

describe("booting Switchboard", () => {
  it("creates v2-required documents and drives by default", async () => {
    await withSwitchboard({}, async ({ reactor }) => {
      const document = await reactor.createEmpty("powerhouse/document-model");
      expect(signaturePolicyOf(document.header)).toBe("v2-required");
      expect(hasDerivedDocumentId(document.header)).toBe(true);

      const drive = await reactor.drives.create({ global: { name: "Drive" } });
      expect(signaturePolicyOf(drive.header)).toBe("v2-required");

      const defaultDrive = await reactor.get("default-drive");
      expect(signaturePolicyOf(defaultDrive.header)).toBe("v2-required");
    });
  }, 60_000);

  it("creates legacy documents and drives under CREATE_SIGNATURE_POLICY=legacy", async () => {
    await withSwitchboard(
      { CREATE_SIGNATURE_POLICY: "legacy" },
      async ({ reactor }) => {
        const document = await reactor.createEmpty("powerhouse/document-model");
        expect(signaturePolicyOf(document.header)).toBe("legacy");
        expect(isDerivedDocumentId(document.header.id)).toBe(false);

        const drive = await reactor.drives.create({
          global: { name: "Drive" },
        });
        expect(signaturePolicyOf(drive.header)).toBe("legacy");
        expect(isDerivedDocumentId(drive.header.id)).toBe(false);

        const defaultDrive = await reactor.get("default-drive");
        expect(signaturePolicyOf(defaultDrive.header)).toBe("legacy");

        const asked = await reactor.createEmpty("powerhouse/document-model", {
          signaturePolicy: "v2-required",
        });
        expect(hasDerivedDocumentId(asked.header)).toBe(true);
      },
    );
  }, 60_000);
});
