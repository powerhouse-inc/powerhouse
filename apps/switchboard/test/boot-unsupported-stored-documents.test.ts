import { PGlite } from "@electric-sql/pglite";
import { AtomicNodeFs } from "@powerhousedao/pglite-fs";
import {
  JobStatus,
  ReactorBuilder,
  type Database,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  withSignaturePolicy,
  type PeerCapability,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { Kysely } from "kysely";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ClosablePGliteDialect } from "../src/pglite-dialect.js";
import { startSwitchboard } from "../src/server.mjs";
import { StoredDocumentsRefusedError } from "../src/unsupported-stored-documents.mjs";

const ENV_KEYS = [
  "PH_REACTOR_DATABASE_URL",
  "DATABASE_URL",
  "REACTOR_UNSUPPORTED_STORED_DOCUMENTS",
] as const;

const BASE_REDUCER_7: PeerCapability = {
  kind: "protocol",
  name: "base-reducer",
  baseline: [1, 2],
  supported: () => [1, 2, 7],
  preferred: () => 2,
  optional: false,
};

type StubLogger = ILogger & {
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

function stubLogger(): StubLogger {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as StubLogger;
}

/** A reactor store holding one drive created at base-reducer 7. */
async function seedStore(dir: string): Promise<void> {
  const db = new Kysely<Database>({
    dialect: new ClosablePGliteDialect(
      new PGlite({ fs: new AtomicNodeFs(dir) }),
    ),
  });
  const module = await new ReactorBuilder()
    .withKysely(db)
    .withDocumentModelSources([driveDocumentModelModule as never])
    .withPeerCapabilities([BASE_REDUCER_7])
    .buildModule();
  const created = await module.reactor.create(
    withSignaturePolicy(
      driveDocumentModelModule.utils.createDocument(),
      "legacy",
      {
        id: "br7-stored",
        protocolVersions: { "base-reducer": 7 },
      },
    ),
  );
  await vi.waitUntil(
    async () => {
      const { status } = await module.reactor.getJobStatus(created.id);
      return status === JobStatus.READ_READY || status === JobStatus.FAILED;
    },
    // One job is ~40 full snapshots; the Windows runner needs the boot budget.
    { timeout: BOOT_TIMEOUT, interval: 5 },
  );
  expect((await module.reactor.getJobStatus(created.id)).status).toBe(
    JobStatus.READ_READY,
  );
  await module.reactor.kill().completed;
  await db.destroy();
}

// PGlite boots are several times slower on Windows runners.
const BOOT_TIMEOUT = 120_000;

describe("booting over documents this build does not run", () => {
  let seeded: string;
  let tempRoot: string;
  let previous: Partial<Record<(typeof ENV_KEYS)[number], string>>;

  beforeAll(async () => {
    seeded = await mkdtemp(join(tmpdir(), "switchboard-stored-protocol-seed-"));
    await seedStore(join(seeded, "reactor-storage"));
  }, BOOT_TIMEOUT);

  afterAll(async () => {
    await rm(seeded, { recursive: true, force: true });
  });

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "switchboard-stored-protocol-"));
    previous = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
    process.env.DATABASE_URL = join(tempRoot, "read-model");
    delete process.env.REACTOR_UNSUPPORTED_STORED_DOCUMENTS;
    await cp(
      join(seeded, "reactor-storage"),
      process.env.PH_REACTOR_DATABASE_URL,
      { recursive: true },
    );
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

  function boot(logger: ILogger) {
    return startSwitchboard({
      workflows: { enabled: false },
      port: 0,
      mcp: false,
      disableLocalPackages: true,
      identity: { keypairPath: join(tempRoot, "identity.json") },
      logger,
    });
  }

  it(
    "refuses by default and tells the operator both ways forward",
    async () => {
      const logger = stubLogger();

      const booted = boot(logger);

      await expect(booted).rejects.toSatisfy(
        (error) =>
          StoredDocumentsRefusedError.isError(error) &&
          error.documents === 1 &&
          error.versions.some(
            ({ protocol, version }) =>
              protocol === "base-reducer" && version === 7,
          ),
      );
      const message = (await booted.catch((error: Error) => error)) as Error;
      expect(message.message).toMatch(
        /1 stored document\(s\) require base-reducer 7/,
      );
      expect(message.message).toMatch(
        /switchboard build that runs base-reducer 7/,
      );
      expect(message.message).toMatch(
        /REACTOR_UNSUPPORTED_STORED_DOCUMENTS=read-only/,
      );
      expect(logger.error).toHaveBeenCalledWith(message.message);
      expect(logger.error).not.toHaveBeenCalledWith(
        "App crashed: @error",
        expect.anything(),
      );
    },
    BOOT_TIMEOUT,
  );

  it(
    "starts read-only when REACTOR_UNSUPPORTED_STORED_DOCUMENTS says so",
    async () => {
      process.env.REACTOR_UNSUPPORTED_STORED_DOCUMENTS = "read-only";
      const logger = stubLogger();

      const switchboard = await boot(logger);
      try {
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining("read-only"),
          expect.stringContaining(
            "1 stored document(s) require base-reducer 7",
          ),
        );
        const stored = await switchboard.reactor.get("br7-stored");
        expect(stored.header.id).toBe("br7-stored");
      } finally {
        await switchboard.shutdown();
      }
    },
    BOOT_TIMEOUT,
  );
});
