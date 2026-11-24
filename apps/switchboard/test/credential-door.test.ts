// The credential check at the door of a real switchboard (D8): the store's
// records first, then Renown; Renown's last answer while it is away; an unseen
// credential on its signature unless the host refuses; enrolment by a request
// the address signs. Renown is a local fake that can be stopped.
import {
  credentialRecordFile,
  writeCredentialRecord,
} from "@powerhousedao/shared/clis/credential-records";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import {
  buildAndSignCredential,
  enrolCredential,
  MemoryKeyStorage,
  RenownCryptoBuilder,
  withdrawEnrolment,
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
const { privateKeyToAccount, generatePrivateKey } = createRequire(
  import.meta.resolve("@renown/sdk/node"),
)("viem/accounts") as {
  privateKeyToAccount: (key: `0x${string}`) => Account;
  generatePrivateKey: () => `0x${string}`;
};

// A pseudonym: an Ethereum key with no Renown account.
const PSEUDONYM = privateKeyToAccount(generatePrivateKey());
// A person Renown knows.
const PERSON = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

const ENV_KEYS = [
  "PH_REACTOR_DATABASE_URL",
  "AUTH_ENABLED",
  "ADMINS",
  "RESOLVE_CALLER_IDENTITY",
  "REQUIRE_AUTHENTICATED_CALLER",
  "REFUSE_UNSEEN_CREDENTIALS_OFFLINE",
  "RENOWN_SOURCE",
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

const signAs =
  (account: Account): SignCredentialTypedData =>
  (args) =>
    account.signTypedData(args);

const credentialFor = (
  account: Account,
  key: string,
  days = 30,
): Promise<PowerhouseVerifiableCredential> =>
  buildAndSignCredential({
    signTypedData: signAs(account),
    address: account.address,
    chainId: 1,
    app: "vetra agent",
    appId: key,
    expiresInDays: days,
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

describe(
  "the credential check at a switchboard's door",
  { timeout: 60_000 },
  () => {
    let root = "";
    let previous: [string, string | undefined][] = [];
    let switchboard: Switchboard | undefined;
    let renown: { server: Server; url: string };
    let person: IRenownCrypto;

    const config = (refuseUnseenOffline = false): SwitchboardConfigInput => ({
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
        refuseUnseenOffline,
        renown: { url: renown.url },
      },
    });

    const boot = async (refuseUnseenOffline = false) => {
      await switchboard?.shutdown();
      switchboard = await bootSwitchboard(config(refuseUnseenOffline), {
        logger,
      });
    };

    const ask = async (
      key: IRenownCrypto,
      account: Account,
      credential?: PowerhouseVerifiableCredential,
    ): Promise<number> => {
      const bearer = await key.getBearerToken(account.address, {
        expiresIn: 60,
        ...(credential ? { credential } : {}),
      });
      const response = await fetch(
        `http://127.0.0.1:${String(switchboard!.port)}/graphql`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${bearer}`,
          },
          body: JSON.stringify({ query: "{ __typename }" }),
        },
      );
      await response.text();
      return response.status;
    };

    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), "switchboard-credential-door-"));
      previous = ENV_KEYS.map((key) => [key, process.env[key]]);
      for (const key of ENV_KEYS) delete process.env[key];
      process.env.PH_REACTOR_DATABASE_URL = join(root, "reactor-storage");
      person = await newKey();
      renown = await fakeRenown(
        new Map([[person.did, await credentialFor(PERSON, person.did)]]),
      );
      await boot();
    }, 120_000);

    afterAll(async () => {
      await switchboard?.shutdown();
      await stopped(renown.server);
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await rm(root, { recursive: true, force: true });
    }, 60_000);

    it("admits a pseudonym whose credential has a record, with its label", async () => {
      const session = await newKey();
      const credential = await credentialFor(PSEUDONYM, session.did);
      writeCredentialRecord({ dataDir: root, credential, source: "cli" });
      expect(await ask(session, PSEUDONYM)).toBe(200);

      const bearer = await session.getBearerToken(PSEUDONYM.address, {
        expiresIn: 60,
      });
      const api = (
        switchboard as unknown as {
          api: { authService: { verifyBearer(a: string): Promise<unknown> } };
        }
      ).api;
      expect(
        await api.authService.verifyBearer(`Bearer ${bearer}`),
      ).toMatchObject({
        user: { label: "vetra agent", via: "record" },
      });
    });

    it("refuses a removed record at the next request, without a restart", async () => {
      const session = await newKey();
      const credential = await credentialFor(PSEUDONYM, session.did);
      const { id } = writeCredentialRecord({
        dataDir: root,
        credential,
        source: "cli",
      });
      expect(await ask(session, PSEUDONYM, credential)).toBe(200);
      rmSync(credentialRecordFile(root, id));
      expect(await ask(session, PSEUDONYM, credential)).toBe(401);
    });

    it("refuses an expired credential, even with a record", async () => {
      const session = await newKey();
      const credential = await credentialFor(PSEUDONYM, session.did, -1);
      writeCredentialRecord({ dataDir: root, credential, source: "cli" });
      expect(await ask(session, PSEUDONYM)).toBe(401);
    });

    it("admits what Renown registers, and refuses an unenrolled pseudonym", async () => {
      expect(await ask(person, PERSON)).toBe(200);
      const session = await newKey();
      expect(
        await ask(
          session,
          PSEUDONYM,
          await credentialFor(PSEUDONYM, session.did),
        ),
      ).toBe(401);
    });

    it("enrols a pseudonym by a request it signs, and withdraws it the same way", async () => {
      const hostUrl = `http://127.0.0.1:${String(switchboard!.port)}/`;
      const session = await newKey();
      const credential = await credentialFor(PSEUDONYM, session.did);
      await enrolCredential({
        hostUrl,
        credential,
        signTypedData: signAs(PSEUDONYM),
      });
      expect(await ask(session, PSEUDONYM, credential)).toBe(200);
      const { withdrawn } = await withdrawEnrolment({
        hostUrl,
        chainId: 1,
        sessionDid: session.did,
        signTypedData: signAs(PSEUDONYM),
      });
      expect(withdrawn).toHaveLength(1);
      expect(await ask(session, PSEUDONYM, credential)).toBe(401);
    });

    it("with Renown away: keeps its last answer, accepts an unseen credential on its signature", async () => {
      await stopped(renown.server);
      expect(await ask(person, PERSON)).toBe(200);
      const session = await newKey();
      const credential = await credentialFor(PSEUDONYM, session.did);
      expect(await ask(session, PSEUDONYM, credential)).toBe(200);
      // Without the credential in the bearer there is nothing to check.
      expect(await ask(session, PSEUDONYM)).toBe(401);
    });

    it("refuses an unseen credential with Renown away when told to, after a restart", async () => {
      await boot(true);
      // Renown's last answer was kept on disk.
      expect(await ask(person, PERSON)).toBe(200);
      const session = await newKey();
      expect(
        await ask(
          session,
          PSEUDONYM,
          await credentialFor(PSEUDONYM, session.did),
        ),
      ).toBe(401);
    }, 120_000);
  },
);
