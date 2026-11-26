// Who administers an instance over HTTP: ADMINS, and whom its launcher named
// (`PH_OPERATOR`), the OS user's identities read as they change. No caller
// becomes an owner by signing in first.
import { ensurePseudonym } from "@powerhousedao/shared/clis/identity";
import {
  ChannelScheme,
  EventBus,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import type { DocumentModelModule, ILogger } from "document-model";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeAndStartAPI } from "../src/server.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import {
  OperatorSet,
  parseOperatorSource,
} from "../src/services/operator-set.js";

const ADMIN = "0x00000000000000000000000000000000000000aa";
const NAMED = "0x00000000000000000000000000000000000000bb";
const STRANGER = "0x00000000000000000000000000000000000000cc";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "operator-set-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});

describe("PH_OPERATOR", () => {
  it("names the OS user, addresses, or both", () => {
    expect(parseOperatorSource("os-user")).toEqual({
      osUser: true,
      addresses: [],
    });
    expect(parseOperatorSource(` ${NAMED.toUpperCase()}, os-user `)).toEqual({
      osUser: true,
      addresses: [NAMED],
    });
    expect(parseOperatorSource(undefined)).toBeUndefined();
    expect(parseOperatorSource(" , ")).toBeUndefined();
  });

  it("refuses what is neither", () => {
    expect(() => parseOperatorSource("everyone")).toThrow(/PH_OPERATOR/);
  });
});

describe("the operator set", () => {
  it("holds the admins and the addresses the launcher named, never anonymous", () => {
    const set = new OperatorSet({
      admins: [ADMIN.toUpperCase()],
      source: { osUser: false, addresses: [NAMED] },
    });
    expect(set.has(ADMIN)).toBe(true);
    expect(set.has(NAMED.toUpperCase())).toBe(true);
    expect(set.has(STRANGER)).toBe(false);
    expect(set.has(undefined)).toBe(false);
    expect(set.configured).toBe(true);
    expect(new OperatorSet({ admins: [] }).configured).toBe(false);
  });

  it("holds the OS user's pseudonym, one made after boot included", () => {
    const dataDir = tempDir();
    const env = { PH_IDENTITY_HOME: path.join(tempDir(), "home") };
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const set = new OperatorSet({
      admins: [],
      source: { osUser: true, addresses: [] },
      dataDir,
      env,
    });
    expect(set.has(STRANGER)).toBe(false);
    return ensurePseudonym({ dataDir, env }).then((pseudonym) => {
      // Read again within a second, so the new one counts at once.
      now += 1_500;
      expect(set.has(pseudonym.address)).toBe(true);
      expect(set.has(STRANGER)).toBe(false);
    });
  });
});

describe("the authorization service", () => {
  it("makes no caller an operator under OPEN, and the operators admins under ADMIN_ONLY", () => {
    const operators = new OperatorSet({
      admins: [ADMIN],
      source: { osUser: false, addresses: [NAMED] },
    });
    const open = createAuthorizationService({
      admins: [ADMIN],
      defaultProtection: false,
      policy: AuthorizationPolicy.OPEN,
      operators,
    });
    expect(open.isSupremeAdmin(STRANGER)).toBe(true);
    expect(open.isOperator(STRANGER)).toBe(false);
    expect(open.isOperator(undefined)).toBe(false);
    expect(open.isOperator(NAMED)).toBe(true);

    const adminOnly = createAuthorizationService({
      admins: [ADMIN],
      defaultProtection: false,
      policy: AuthorizationPolicy.ADMIN_ONLY,
      operators,
    });
    expect(adminOnly.isSupremeAdmin(NAMED)).toBe(true);
    expect(adminOnly.isSupremeAdmin(STRANGER)).toBe(false);
  });
});

describe("booting with no administrator", () => {
  const initializeClient = async (documentModels: DocumentModelModule[]) => ({
    module: await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withEventBus(new EventBus())
          .withDocumentModelSources(documentModels)
          .withChannelScheme(ChannelScheme.SWITCHBOARD),
      )
      .buildModule(),
  });

  function spyLogger() {
    const warn = vi.fn();
    const info = vi.fn();
    const logger: ILogger = {
      level: "info",
      verbose: vi.fn(),
      debug: vi.fn(),
      info,
      warn,
      error: vi.fn(),
      errorHandler: () => undefined,
      child: () => logger,
    } as unknown as ILogger;
    return { logger, warn, info };
  }

  it("warns that administration is refused, and that the owner claim is not read", async () => {
    const { logger, warn } = spyLogger();
    const api = await initializeAndStartAPI(
      initializeClient,
      {
        port: 0,
        dbPath: undefined,
        mcp: false,
        logger,
        auth: { ownerClaim: true, stateDir: path.join(tempDir(), ".ph") },
      },
      "switchboard",
    );
    try {
      const warned = warn.mock.calls.map((call) => String(call[0]));
      expect(warned).toContain(
        "No administrator: package installs and other administration over HTTP are refused. Set ADMINS.",
      );
      expect(
        warned.some((line) =>
          line.startsWith("auth.ownerClaim is no longer read"),
        ),
      ).toBe(true);
      expect(api.authorizationService.isOperator(STRANGER)).toBe(false);
    } finally {
      await api.dispose();
    }
  });

  it("is administered by whom the launcher named", async () => {
    const { logger, warn, info } = spyLogger();
    const api = await initializeAndStartAPI(
      initializeClient,
      {
        port: 0,
        dbPath: undefined,
        mcp: false,
        logger,
        auth: { operator: NAMED, stateDir: path.join(tempDir(), ".ph") },
      },
      "switchboard",
    );
    try {
      expect(
        warn.mock.calls.some((call) =>
          String(call[0]).startsWith("No administrator"),
        ),
      ).toBe(false);
      expect(
        info.mock.calls.some(
          (call) =>
            String(call[0]).startsWith("Administered by") &&
            String(call[1]).includes(NAMED),
        ),
      ).toBe(true);
      expect(api.authorizationService.isOperator(NAMED)).toBe(true);
    } finally {
      await api.dispose();
    }
  });
});
