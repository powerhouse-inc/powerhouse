import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import type { SwitchboardConfigInput } from "../src/config/schema.js";
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

/**
 * Boots an edge the way the real one does — the caller's config layer over the
 * env's — so a test can drive `systemInfo` from either SYSTEM_INFO_ENABLED (the
 * `env` layer) or the host option (`features.systemInfo`) and watch them
 * resolve against each other.
 */
async function withSwitchboard(
  env: NodeJS.ProcessEnv,
  features: { systemInfo?: boolean },
  run: (
    switchboard: Awaited<ReturnType<typeof bootSwitchboard>>,
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "switchboard-system-info-"));
  const config: SwitchboardConfigInput = {
    server: { port: 0 },
    storage: { inMemory: true, userDataDir: root },
    features: { workflows: false, mcp: false, ...features },
    packages: { disableLocal: true },
    identity: { keypairPath: join(root, "identity.json") },
  };
  let switchboard: Awaited<ReturnType<typeof bootSwitchboard>> | undefined;
  try {
    switchboard = await bootSwitchboard(
      config,
      {
        logger: stubLogger(),
        signalHandlers: false,
        fatalErrorShutdown: false,
      },
      env,
    );
    await run(switchboard);
  } finally {
    await switchboard?.shutdown();
    await rm(root, { recursive: true, force: true });
  }
}

const query = `{ system { version gitHash } }`;

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
  it("mounts /graphql/system by default", async () => {
    await withSwitchboard({}, {}, async ({ systemInfoEnabled, port }) => {
      expect(systemInfoEnabled).toBe(true);
      const { status, body } = await postQuery(port, "/graphql/system");
      expect(status).toBe(200);
      const { data } = body as {
        data?: { system?: { version?: unknown; gitHash?: unknown } };
      };
      expect(typeof data?.system?.version).toBe("string");
      expect(typeof data?.system?.gitHash).toBe("string");
    });
  }, 60_000);

  it('leaves /graphql/system unmounted under SYSTEM_INFO_ENABLED="false"', async () => {
    await withSwitchboard(
      { SYSTEM_INFO_ENABLED: "false" },
      {},
      async ({ systemInfoEnabled, port }) => {
        expect(systemInfoEnabled).toBe(false);
        expect((await postQuery(port, "/graphql/system")).status).toBe(404);
        const supergraph = await postQuery(port, "/graphql");
        const { errors } = supergraph.body as {
          errors?: { message: string }[];
        };
        expect(errors?.[0]?.message).toContain('Cannot query field "system"');
      },
    );
  }, 60_000);

  it("keeps a caller's systemInfo: false over SYSTEM_INFO_ENABLED=true", async () => {
    await withSwitchboard(
      { SYSTEM_INFO_ENABLED: "true" },
      { systemInfo: false },
      async ({ systemInfoEnabled, port }) => {
        expect(systemInfoEnabled).toBe(false);
        expect((await postQuery(port, "/graphql/system")).status).toBe(404);
      },
    );
  }, 60_000);
});
