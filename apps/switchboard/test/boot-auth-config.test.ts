import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import type { SwitchboardConfigInput } from "../src/config/schema.js";
import { bootSwitchboard } from "./boot-helpers.js";

type Info = ReturnType<typeof vi.fn>;

function stubLogger(): ILogger & { info: Info } {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as ILogger & { info: Info };
}

const AUTH_VARS = ["AUTH_ENABLED", "ADMINS", "RESOLVE_CALLER_IDENTITY"];

/** Whether the switchboard enforces auth, from reactor-api's setup log. */
async function bootsWithAuth(options: {
  file: Record<string, unknown>;
  config?: SwitchboardConfigInput["auth"];
  env?: Record<string, string>;
}): Promise<boolean> {
  const tempRoot = await mkdtemp(join(tmpdir(), "switchboard-auth-config-"));
  const names = ["PH_REACTOR_DATABASE_URL", ...AUTH_VARS];
  const previous = names.map((name) => [name, process.env[name]] as const);
  for (const name of AUTH_VARS) delete process.env[name];
  process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
  Object.assign(process.env, options.env);
  const configFile = join(tempRoot, "powerhouse.config.json");
  await writeFile(configFile, JSON.stringify(options.file));
  const logger = stubLogger();
  const switchboard = await bootSwitchboard(
    {
      configFile,
      auth: options.config,
      server: { port: 0 },
      storage: { readModel: { url: join(tempRoot, "read-model") } },
      features: { workflows: false, mcp: false },
      packages: { disableLocal: true },
      identity: { keypairPath: join(tempRoot, "identity.json") },
    },
    { logger },
  ).finally(() => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  try {
    const setup = logger.info.mock.calls.find(
      ([message]) =>
        typeof message === "string" &&
        message.startsWith("Setting up Auth middleware"),
    );
    return setup?.[1] === true;
  } finally {
    await switchboard.shutdown();
    await rm(tempRoot, { recursive: true, force: true });
  }
}

const ADMIN = "0x1111111111111111111111111111111111111111";

describe("booting Switchboard with auth", () => {
  it("enforces auth the config turns on", async () => {
    expect(
      await bootsWithAuth({
        file: {},
        config: { enabled: true, admins: [ADMIN] },
      }),
    ).toBe(true);
  }, 60_000);

  it("still takes auth from the config file when the config leaves it unset", async () => {
    expect(
      await bootsWithAuth({
        file: { auth: { enabled: true, admins: [ADMIN] } },
      }),
    ).toBe(true);
  }, 60_000);

  it("lets AUTH_ENABLED override the config file, as before", async () => {
    expect(
      await bootsWithAuth({
        file: { auth: { enabled: true, admins: [ADMIN] } },
        env: { AUTH_ENABLED: "false" },
      }),
    ).toBe(false);
  }, 60_000);

  it("lets AUTH_ENABLED override the caller's config, as it overrode options", async () => {
    expect(
      await bootsWithAuth({
        file: {},
        config: { enabled: false },
        env: { AUTH_ENABLED: "true", ADMINS: ADMIN },
      }),
    ).toBe(true);
  }, 60_000);
});
