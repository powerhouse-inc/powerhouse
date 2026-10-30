// A switchboard shaped like the desktop host's: sign-in enforced, the first
// person the owner, bound to loopback, and working with Renown unreachable once
// that person has signed in (ADR 0008 §11).
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import type { GraphQLManager } from "@powerhousedao/reactor-api";
import {
  buildAndSignCredential,
  MemoryKeyStorage,
  RenownCryptoBuilder,
  type IRenownCrypto,
  type PowerhouseVerifiableCredential,
  type SignCredentialTypedData,
} from "@renown/sdk/node";
import type { ILogger } from "document-model";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SwitchboardConfigInput } from "../src/config/schema.js";
import type { startSwitchboard } from "../src/server.mjs";
import { bootSwitchboard } from "./boot-helpers.js";

// viem is the SDK's own dependency; the switchboard does not declare it.
type Account = {
  address: `0x${string}`;
  signTypedData(args: unknown): Promise<`0x${string}`>;
};
const { privateKeyToAccount } = createRequire(
  import.meta.resolve("@renown/sdk/node"),
)("viem/accounts") as {
  privateKeyToAccount: (key: `0x${string}`) => Account;
};

// Well-known Anvil dev keys; never used for anything real.
const PERSON = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const VISITOR = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

const ENV_KEYS = [
  "PH_REACTOR_DATABASE_URL",
  "AUTH_ENABLED",
  "ADMINS",
  "RESOLVE_CALLER_IDENTITY",
  "REQUIRE_AUTHENTICATED_CALLER",
  "RENOWN_URL",
  "SWITCHBOARD_URL",
] as const;

const logger = {
  verbose: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => logger,
} as unknown as ILogger;

type Switchboard = Awaited<ReturnType<typeof startSwitchboard>>;

const newKey = (): Promise<IRenownCrypto> =>
  new RenownCryptoBuilder().withKeyPairStorage(new MemoryKeyStorage()).build();

const credentialFor = (
  account: Account,
  key: string,
  expiresInDays = 7,
): Promise<PowerhouseVerifiableCredential> =>
  buildAndSignCredential({
    signTypedData: ((args) =>
      account.signTypedData(args)) as SignCredentialTypedData,
    address: account.address,
    chainId: 1,
    app: "connect",
    appId: key,
    expiresInDays,
  });

/** Renown's REST lookup and nothing else. */
function fakeRenown(
  credentials: Map<string, PowerhouseVerifiableCredential>,
): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://renown.test");
    const credential =
      url.pathname === "/api/auth/credential"
        ? credentials.get(url.searchParams.get("appId") ?? "")
        : undefined;
    response.writeHead(credential ? 200 : 404, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify(credential ? { credential } : {}));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" ? address?.port : undefined;
      resolve({ server, url: `http://127.0.0.1:${String(port)}` });
    });
  });
}

const stopped = (server: Server) =>
  new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });

describe("a switchboard on a person's own computer", () => {
  let root = "";
  let previous: [string, string | undefined][] = [];
  let switchboard: Switchboard | undefined;
  let person: IRenownCrypto;
  let visitor: IRenownCrypto;
  let renown: { server: Server; url: string };

  const config = (renownUrl: string): SwitchboardConfigInput => ({
    server: { port: 0, host: "127.0.0.1" },
    storage: {
      userDataDir: root,
      readModel: { url: join(root, "read-model") },
    },
    features: { workflows: false, mcp: false },
    packages: { disableLocal: true },
    auth: {
      enabled: true,
      requireAuthenticatedCaller: true,
      resolveIdentity: true,
      ownerClaim: true,
      offlineCredentials: true,
      renown: { source: "remote", url: renownUrl },
    },
  });

  const boot = async (renownUrl: string) => {
    switchboard = await bootSwitchboard(config(renownUrl), { logger });
  };

  const stop = async () => {
    await switchboard?.shutdown();
    switchboard = undefined;
  };

  const ask = async (
    key?: IRenownCrypto,
    address?: string,
  ): Promise<number> => {
    const bearer = key ? await key.getBearerToken(address) : undefined;
    const response = await fetch(
      `http://127.0.0.1:${String(switchboard!.port)}/graphql`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        },
        body: JSON.stringify({ query: "{ __typename }" }),
      },
    );
    return response.status;
  };

  const isAdmin = (address: string): boolean =>
    (
      switchboard as unknown as { api: { graphqlManager: GraphQLManager } }
    ).api.graphqlManager
      .getAuthorizationService()
      .isSupremeAdmin(address);

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "switchboard-desktop-auth-"));
    previous = ENV_KEYS.map((key) => [key, process.env[key]]);
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.PH_REACTOR_DATABASE_URL = join(root, "reactor-storage");

    person = await newKey();
    visitor = await newKey();
    renown = await fakeRenown(
      new Map([
        // Past its date: it is the proof that counts while Renown is away.
        [person.did, await credentialFor(PERSON, person.did, -1)],
        [visitor.did, await credentialFor(VISITOR, visitor.did)],
      ]),
    );
    await boot(renown.url);
  }, 120_000);

  afterAll(async () => {
    await stop();
    await stopped(renown.server);
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }, 60_000);

  it("refuses anyone not signed in", async () => {
    expect(await ask()).toBe(401);
  });

  it("makes the first person to sign in its owner, with no env file", async () => {
    expect(isAdmin(PERSON.address)).toBe(false);
    expect(await ask(person, PERSON.address)).toBe(200);
    expect(isAdmin(PERSON.address)).toBe(true);
    const owner = JSON.parse(
      await readFile(join(root, ".ph", ".owner.json"), "utf8"),
    ) as { owner: string };
    expect(owner.owner).toBe(PERSON.address.toLowerCase());
  });

  it("gives a second person no ownership", async () => {
    expect(await ask(visitor, VISITOR.address)).toBe(200);
    expect(isAdmin(VISITOR.address)).toBe(false);
  });

  it("answers on loopback only", async () => {
    const lan = Object.values(networkInterfaces())
      .flat()
      .find((entry) => entry?.family === "IPv4" && !entry.internal);
    if (!lan) return;
    await expect(
      fetch(`http://${lan.address}:${String(switchboard!.port)}/graphql`, {
        signal: AbortSignal.timeout(3_000),
      }),
    ).rejects.toThrow();
  });

  it("boots and verifies its owner with Renown unreachable", async () => {
    expect(existsSync(join(root, ".ph", ".credentials.json"))).toBe(true);
    await stop();
    await stopped(renown.server);

    await boot(renown.url);

    expect(await ask(person, PERSON.address)).toBe(200);
    expect(isAdmin(PERSON.address)).toBe(true);
  }, 120_000);

  it("verifies nobody it has not seen while Renown is unreachable", async () => {
    const stranger = await newKey();
    expect(await ask(stranger, VISITOR.address)).toBe(401);
    expect(await ask()).toBe(401);
  });
});
