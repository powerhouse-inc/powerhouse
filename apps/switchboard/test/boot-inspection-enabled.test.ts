import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import { startSwitchboard } from "../src/server.mjs";

// `port: 0` would bind a random port the switchboard does not report back, so
// the test picks a free one and pins it.
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!address || typeof address === "string") throw new Error("no port");
  return address.port;
}

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
  inspection: boolean | undefined,
  run: (
    switchboard: Awaited<ReturnType<typeof startSwitchboard>>,
  ) => Promise<void>,
): Promise<void> {
  const tempRoot = await mkdtemp(
    join(tmpdir(), "switchboard-inspection-enabled-"),
  );
  const names = [
    "PH_REACTOR_DATABASE_URL",
    "INSPECTION_ENABLED",
    ...Object.keys(env),
  ];
  const previous = names.map((name) => [name, process.env[name]] as const);
  process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
  delete process.env.INSPECTION_ENABLED;
  Object.assign(process.env, env);
  let switchboard: Awaited<ReturnType<typeof startSwitchboard>> | undefined;

  try {
    switchboard = await startSwitchboard({
      workflows: { enabled: false },
      dbPath: join(tempRoot, "read-model"),
      port: await freePort(),
      strictPort: true,
      inspection,
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

const query = `{ inspection { info { workflows } } }`;

async function postQuery(
  port: number,
  path: string,
  source = query,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: source }),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON; keep the raw text.
  }
  return { status: response.status, body };
}

describe("booting Switchboard", () => {
  it("mounts /graphql/inspection by default", async () => {
    await withSwitchboard(
      {},
      undefined,
      async ({ inspectionEnabled, port }) => {
        expect(inspectionEnabled).toBe(true);
        const { status, body } = await postQuery(port, "/graphql/inspection");
        expect(status).toBe(200);
        expect(body).toMatchObject({
          data: { inspection: { info: { workflows: false } } },
        });
      },
    );
  }, 60_000);

  it('leaves /graphql/inspection unmounted under INSPECTION_ENABLED="false"', async () => {
    await withSwitchboard(
      { INSPECTION_ENABLED: "false" },
      undefined,
      async ({ inspectionEnabled, port }) => {
        expect(inspectionEnabled).toBe(false);
        expect((await postQuery(port, "/graphql/inspection")).status).toBe(404);
        const supergraph = await postQuery(port, "/graphql");
        const { errors } = supergraph.body as {
          errors?: { message: string }[];
        };
        expect(errors?.[0]?.message).toContain(
          'Cannot query field "inspection"',
        );
      },
    );
  }, 60_000);

  it("keeps a host's inspection: false over INSPECTION_ENABLED=true", async () => {
    await withSwitchboard(
      { INSPECTION_ENABLED: "true" },
      false,
      async ({ inspectionEnabled, port }) => {
        expect(inspectionEnabled).toBe(false);
        expect((await postQuery(port, "/graphql/inspection")).status).toBe(404);
      },
    );
  }, 60_000);

  it("mounts the reactor drive subgraph at /graphql/reactor-drive-nodes", async () => {
    await withSwitchboard({}, undefined, async ({ port }) => {
      await vi.waitFor(
        async () =>
          expect(
            await postQuery(
              port,
              "/graphql/reactor-drive-nodes",
              '{ reactorDrive(id: "missing") { id } }',
            ),
          ).toEqual({ status: 200, body: { data: { reactorDrive: null } } }),
        { timeout: 30_000, interval: 250 },
      );
    });
  }, 60_000);
});
