import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import type { startSwitchboard } from "../src/server.mjs";
import { bootSwitchboard } from "./boot-helpers.js";

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
    switchboard = await bootSwitchboard(
      {
        server: { port: 0 },
        storage: { readModel: { url: join(tempRoot, "read-model") } },
        features: { workflows: false },
        inspection: { enabled: inspection },
        packages: { disableLocal: true },
        identity: { keypairPath: join(tempRoot, "identity.json") },
        drive: {
          slug: "default-drive",
          global: { name: "Default Drive" },
        },
      },
      { logger: stubLogger() },
    );
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
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
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
});
