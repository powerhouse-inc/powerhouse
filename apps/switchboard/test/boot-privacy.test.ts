import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import { startSwitchboard } from "../src/server.mjs";

const ADMIN = "0xadad00000000000000000000000000000000adad";
const SECRET = "switchboard-privacy-test-deployment-secret-0123";

function stubLogger(): ILogger & { error: ReturnType<typeof vi.fn> } {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as ILogger & { error: ReturnType<typeof vi.fn> };
}

type Switchboard = Awaited<ReturnType<typeof startSwitchboard>>;

async function withEnv<T>(
  env: Record<string, string>,
  run: (tempRoot: string) => Promise<T>,
): Promise<T> {
  const tempRoot = await mkdtemp(join(tmpdir(), "switchboard-privacy-"));
  const names = [
    "PH_REACTOR_DATABASE_URL",
    "AUTH_ENABLED",
    "ADMINS",
    "PH_PRIVACY_ENABLED",
    "PH_PRIVACY_DEPLOYMENT_SECRET",
    ...Object.keys(env),
  ];
  const previous = names.map((name) => [name, process.env[name]] as const);
  for (const name of names) delete process.env[name];
  process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
  Object.assign(process.env, env);
  try {
    return await run(tempRoot);
  } finally {
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

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (address === null || typeof address === "string") {
    throw new Error("no port");
  }
  return address.port;
}

async function boot(
  tempRoot: string,
  logger: ILogger = stubLogger(),
): Promise<Switchboard> {
  return startSwitchboard({
    workflows: { enabled: false },
    dbPath: join(tempRoot, "read-model"),
    port: await freePort(),
    strictPort: true,
    mcp: false,
    disableLocalPackages: true,
    identity: { keypairPath: join(tempRoot, "identity.json") },
    logger,
  });
}

async function queryErasure(switchboard: Switchboard) {
  const response = await fetch(`http://127.0.0.1:${switchboard.port}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `{ erasureRequest(requestId: "none") { requestId } }`,
    }),
  });
  return (await response.json()) as {
    errors?: { message: string; extensions?: { code?: string } }[];
  };
}

describe("booting Switchboard with the privacy add-on", () => {
  it("mounts nothing when PH_PRIVACY_ENABLED is off", async () => {
    await withEnv({}, async (tempRoot) => {
      const switchboard = await boot(tempRoot);
      try {
        expect(switchboard.privacy).toBeUndefined();
        const result = await queryErasure(switchboard);
        expect(result.errors?.[0]?.message).toMatch(/erasureRequest/);
        expect(result.errors?.[0]?.extensions?.code).not.toBe("FORBIDDEN");
      } finally {
        await switchboard.shutdown();
      }
    });
  }, 60_000);

  it("serves erasure to admins only when it is on under authentication", async () => {
    await withEnv(
      {
        AUTH_ENABLED: "true",
        ADMINS: ADMIN,
        PH_PRIVACY_ENABLED: "true",
        PH_PRIVACY_DEPLOYMENT_SECRET: SECRET,
        PH_PRIVACY_INTERVAL_MS: "50",
      },
      async (tempRoot) => {
        const logger = stubLogger();
        const switchboard = await boot(tempRoot, logger);
        try {
          expect(switchboard.privacy).toBeDefined();
          expect(await switchboard.privacy!.erasure.plan([])).toEqual({
            maxPurgeOperations: expect.any(Number) as number,
            items: [],
          });
          await vi.waitUntil(
            async () =>
              (await queryErasure(switchboard)).errors?.[0]?.extensions
                ?.code === "FORBIDDEN",
            { timeout: 20_000, interval: 100 },
          );
          const document = await switchboard.reactor.createEmpty(
            "powerhouse/document-model",
          );
          const id = document.header.id;
          await switchboard.reactor.deleteDocument(id);
          const erasure = switchboard.privacy!.erasure;
          const { requestId } = await erasure.request([id], {
            requestedBy: ADMIN,
          });
          await vi.waitUntil(
            async () => (await erasure.status(requestId)).status === "complete",
            { timeout: 30_000, interval: 100 },
          );
          expect(
            logger.error.mock.calls.filter(([message]) =>
              String(message).startsWith("Erasure"),
            ),
          ).toEqual([]);
        } finally {
          await switchboard.shutdown();
        }
      },
    );
  }, 60_000);

  it("refuses to boot under the OPEN policy", async () => {
    await withEnv(
      {
        PH_PRIVACY_ENABLED: "true",
        PH_PRIVACY_DEPLOYMENT_SECRET: SECRET,
      },
      async (tempRoot) => {
        await expect(boot(tempRoot)).rejects.toThrow(/OPEN/);
      },
    );
  }, 60_000);

  it("refuses to boot without a deployment secret", async () => {
    await withEnv(
      { AUTH_ENABLED: "true", ADMINS: ADMIN, PH_PRIVACY_ENABLED: "true" },
      async (tempRoot) => {
        await expect(boot(tempRoot)).rejects.toThrow(
          /PH_PRIVACY_DEPLOYMENT_SECRET/,
        );
      },
    );
  }, 60_000);
});
