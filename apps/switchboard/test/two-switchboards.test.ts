import { signaturePolicyOf } from "@powerhousedao/shared/document-model";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ILogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SwitchboardConfigInput } from "../src/config/schema.js";
import { startSwitchboard, type SwitchboardReactor } from "../src/server.mjs";

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

function messages(logger: { info: Info }): string[] {
  return logger.info.mock.calls.map(([message]) => String(message));
}

/** The `[policy enforcement, caller identity]` reactor-api logged, if any. */
function authSetup(logger: { info: Info }): unknown[] | undefined {
  return logger.info.mock.calls
    .find(([message]) =>
      String(message).startsWith("Setting up Auth middleware"),
    )
    ?.slice(1);
}

async function throttled(port: number): Promise<boolean> {
  const response = await fetch(`http://localhost:${port}/graphql/inspection`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query:
        '{ inspection { validateDocument(documentId: "missing") { documentId } } }',
    }),
  });
  const body = (await response.json()) as {
    errors?: { extensions?: { code?: string } }[];
  };
  return (body.errors ?? []).some(
    (error) => error.extensions?.code === "TOO_MANY_REQUESTS",
  );
}

// Env a direct caller does not map: nothing inside the server may read it.
const STRAY_ENV = { AUTH_ENABLED: "true", ADMINS: "0xenv" };

describe("two switchboards in one process", () => {
  let root: string;
  const started: SwitchboardReactor[] = [];
  const previous = new Map<string, string | undefined>();

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "switchboard-two-"));
    for (const [name, value] of Object.entries(STRAY_ENV)) {
      previous.set(name, process.env[name]);
      process.env[name] = value;
    }
  });

  afterEach(async () => {
    for (const handle of started.splice(0)) await handle.shutdown();
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    previous.clear();
    await rm(root, { recursive: true, force: true });
  });

  async function boot(name: string, config: SwitchboardConfigInput) {
    const logger = stubLogger();
    const handle = await startSwitchboard(
      {
        server: { port: 0 },
        storage: { inMemory: true, userDataDir: join(root, name) },
        features: { workflows: false, mcp: false },
        packages: { disableLocal: true },
        identity: { keypairPath: join(root, name, "identity.json") },
        ...config,
      },
      { logger, signalHandlers: false, fatalErrorShutdown: false },
    );
    started.push(handle);
    return { handle, logger };
  }

  it("runs each on its own config, not on the process env", async () => {
    const a = await boot("a", {
      protocol: {
        featureFlags: { documentDecisions: true },
        createSignaturePolicy: "legacy",
      },
      auth: { resolveIdentity: true },
      inspection: { callsPerMinute: 1 },
    });
    const b = await boot("b", {
      protocol: { featureFlags: { documentDecisions: false } },
      inspection: { callsPerMinute: 3 },
    });

    expect(a.handle.port).toBeGreaterThan(0);
    expect(b.handle.port).toBeGreaterThan(0);
    expect(a.handle.port).not.toBe(b.handle.port);

    const flagsOn = "Reactor feature flags enabled: documentDecisions";
    expect(messages(a.logger)).toContain(flagsOn);
    expect(messages(b.logger)).not.toContain(flagsOn);

    // AUTH_ENABLED in process.env reaches neither.
    expect(authSetup(a.logger)).toEqual([false, true]);
    expect(authSetup(b.logger)).toBeUndefined();

    const onA = await a.handle.reactor.createEmpty("powerhouse/document-model");
    const onB = await b.handle.reactor.createEmpty("powerhouse/document-model");
    expect(signaturePolicyOf(onA.header)).toBe("legacy");
    expect(signaturePolicyOf(onB.header)).toBe("v2-required");
    const exists = (handle: SwitchboardReactor, id: string) =>
      handle.reactor.get(id).then(
        () => true,
        () => false,
      );
    expect(await exists(a.handle, onA.header.id)).toBe(true);
    expect(await exists(b.handle, onA.header.id)).toBe(false);
    expect(await exists(a.handle, onB.header.id)).toBe(false);

    expect(a.handle.inspectionEnabled).toBe(true);
    expect(b.handle.inspectionEnabled).toBe(true);
    expect(await throttled(a.handle.port)).toBe(false);
    expect(await throttled(a.handle.port)).toBe(true);
    for (let call = 0; call < 3; call++) {
      expect(await throttled(b.handle.port)).toBe(false);
    }
    expect(await throttled(b.handle.port)).toBe(true);
  }, 120_000);
});
