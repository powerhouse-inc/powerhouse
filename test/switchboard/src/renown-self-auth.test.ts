import { spawn, type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { RenownCredentialV1 } from "@powerhousedao/renown-package/document-models";
import {
  buildAndSignCredential,
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
  renownCredentialInput,
  SwitchboardClient,
  type RenownCrypto,
} from "@renown/sdk/node";
import {
  createSwitchboardBackend,
  GraphQLReactorClient,
} from "@powerhousedao/reactor-browser/graphql-client";
import { RoutingReactorClient } from "@powerhousedao/reactor-router";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  createAction,
  type DocumentModelModule,
  type ISigner,
} from "@powerhousedao/shared/document-model";
import { testSigner } from "@powerhousedao/shared/testing";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SWITCHBOARD_COMMAND } from "./switchboard-bin.js";

// A switchboard that serves the renown read model is Renown: seed a delegation
// credential with auth off, reboot with auth on, and assert bearer checks read
// this switchboard's own read model, with no source setting.

const FIXTURE_DIR = resolve(import.meta.dirname, "../renown-self");
const NOPKG_FIXTURE_DIR = resolve(import.meta.dirname, "../renown-self-nopkg");

const PORT = 4022;
const ENDPOINT = `http://localhost:${PORT}/graphql`;
const NOPKG_PORT = 4023;

// Well-known anvil/hardhat account #0; its address is the fixture's admin.
const WALLET_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const CHAIN_ID = 1;
const DEFAULT_DRIVE_ID = "powerhouse";

interface RunningSwitchboard {
  proc: ChildProcess;
  logs: () => string;
  exited: () => boolean;
}

function spawnSwitchboard(
  cwd: string,
  env: Record<string, string>,
): RunningSwitchboard {
  const proc = spawn(...SWITCHBOARD_COMMAND, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let buffer = "";
  let exited = false;
  proc.stdout?.on("data", (chunk: Buffer) => (buffer += chunk.toString()));
  proc.stderr?.on("data", (chunk: Buffer) => (buffer += chunk.toString()));
  proc.on("close", () => (exited = true));
  return { proc, logs: () => buffer, exited: () => exited };
}

async function stopSwitchboard(run: RunningSwitchboard | undefined) {
  if (!run || run.exited()) return;
  await new Promise<void>((done) => {
    run.proc.on("close", () => done());
    run.proc.kill();
    // PGlite shutdown can hang; don't let teardown eat the suite budget.
    setTimeout(() => {
      run.proc.kill("SIGKILL");
      done();
    }, 10_000).unref();
  });
}

async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs: number,
  describeFailure: () => string,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(describeFailure());
}

interface GqlResponse {
  data?: Record<string, unknown> | null;
  errors?: { message: string }[];
}

async function gql(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
): Promise<{ status: number; body: GqlResponse }> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json().catch(() => ({}))) as GqlResponse;
  return { status: response.status, body };
}

// Ready = the merged gateway serves the read-model query, so the renown
// package's subgraph is registered, not just the HTTP server listening.
async function readModelReady(): Promise<boolean> {
  try {
    const { status, body } = await gql(
      "query { renownCredentials(input: {}) { documentId } }",
      {},
    );
    return status === 200 && !body.errors;
  } catch {
    return false;
  }
}

const RENOWN_CREDENTIAL_TYPE = "powerhouse/renown-credential";

/**
 * A client of the fixture's switchboard writing as `signer`, bearing `token`:
 * the switchboard signs no write for its callers.
 */
function writerOf(signer: ISigner, token?: string): GraphQLReactorClient {
  return new GraphQLReactorClient({
    url: ENDPOINT,
    signer,
    tokenProvider: () => Promise.resolve(token),
    documentModels: [
      driveDocumentModelModule,
      RenownCredentialV1 as unknown as DocumentModelModule,
    ],
    realtime: false,
  });
}

const CREATE_DOCUMENT_MUTATION = /* GraphQL */ `
  mutation CreateEmptyDocument($documentType: String!) {
    createEmptyDocument(documentType: $documentType) {
      id
    }
  }
`;

function createDocument(token?: string) {
  return gql(
    CREATE_DOCUMENT_MUTATION,
    { documentType: "powerhouse/document-drive" },
    token,
  );
}

describe("switchboard as its own renown auth provider", () => {
  const account = privateKeyToAccount(WALLET_KEY);
  let appCrypto: RenownCrypto;
  // The wallet's app key, as the credential delegates it.
  let appSigner: ISigner;
  let bearerToken: string;
  let strangerToken: string;
  let credentialDocumentId: string;
  let run: RunningSwitchboard | undefined;

  const readClient = new SwitchboardClient(ENDPOINT);
  const credentialInReadModel = async () =>
    (await readClient.getCredential({
      address: account.address,
      chainId: CHAIN_ID,
      appDid: appCrypto.did,
    })) !== undefined;

  beforeAll(async () => {
    for (const dir of [".ph", "dev.db"]) {
      rmSync(resolve(FIXTURE_DIR, dir), { recursive: true, force: true });
    }

    // Two app identities: one delegated to by the wallet, one stranger.
    appCrypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .withChainId(CHAIN_ID)
      .build();
    const strangerCrypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .withChainId(CHAIN_ID)
      .build();
    bearerToken = await appCrypto.getBearerToken(account.address);
    strangerToken = await strangerCrypto.getBearerToken(account.address);
    appSigner = new RenownCryptoSigner(appCrypto, "switchboard", {
      address: account.address,
      networkId: "eip155",
      chainId: CHAIN_ID,
    });

    // Phase 1 — auth off: seed the delegation credential into this reactor.
    run = spawnSwitchboard(FIXTURE_DIR, {
      PH_SWITCHBOARD_PORT: String(PORT),
      AUTH_ENABLED: "false",
    });
    await waitFor(
      readModelReady,
      120_000,
      () => `seed switchboard never became ready. Logs:\n${run?.logs()}`,
    );

    const credential = await buildAndSignCredential({
      signTypedData: (args) =>
        account.signTypedData(
          args as unknown as Parameters<typeof account.signTypedData>[0],
        ),
      address: account.address,
      chainId: CHAIN_ID,
      app: "switchboard",
      appId: appCrypto.did,
    });
    // The fixture's renown-package predates `renown_issueCredential`: the
    // credential document is written signed, as the switchboard signs none.
    const seeder = writerOf(await testSigner());
    const seeded = await seeder.create(
      await seeder.newDocument(RENOWN_CREDENTIAL_TYPE),
      DEFAULT_DRIVE_ID,
    );
    credentialDocumentId = seeded.header.id;
    await seeder.execute(credentialDocumentId, "main", [
      createAction("INIT", renownCredentialInput(credential)),
    ]);
    await waitFor(
      credentialInReadModel,
      60_000,
      () => `credential never reached the read model. Logs:\n${run?.logs()}`,
    );
    await stopSwitchboard(run);

    // Phase 2 — auth on. No CREDENTIAL_VERIFICATION_CACHE_TTL_MS: checks
    // against an in-process read model are not cached, so the revocation is
    // observed immediately.
    run = spawnSwitchboard(FIXTURE_DIR, {
      PH_SWITCHBOARD_PORT: String(PORT),
      AUTH_ENABLED: "true",
    });
    await waitFor(
      readModelReady,
      120_000,
      () => `auth switchboard never became ready. Logs:\n${run?.logs()}`,
    );
  }, 360_000);

  afterAll(async () => {
    await stopSwitchboard(run);
  }, 30_000);

  it("verifies against its own read model, not a remote renown", () => {
    expect(run?.logs()).toContain(
      "serves the renown read model: credentials are checked against it in process",
    );
  });

  it("rejects a write without a bearer token", async () => {
    const { body } = await createDocument();
    expect(body.data?.createEmptyDocument ?? null).toBeNull();
    expect(body.errors?.length ?? 0).toBeGreaterThan(0);
  });

  it("accepts a bearer token whose delegation lives in the local read model", async () => {
    const writer = writerOf(appSigner, bearerToken);
    const created = await writer.create(
      await writer.newDocument("powerhouse/document-drive"),
    );
    expect(created.header.id).toBeTruthy();
  });

  it("rejects a bearer token with no delegation credential", async () => {
    const { status } = await createDocument(strangerToken);
    expect(status).toBe(401);
  });

  it("routes a write to it only with a bearer", async () => {
    const routerWith = (token: string | undefined) => {
      const remote = createSwitchboardBackend({
        name: "sb",
        url: ENDPOINT,
        tokenProvider: () => Promise.resolve(token),
        signer: appSigner,
        documentModels: () => [driveDocumentModelModule],
        realtime: false,
      });
      return new RoutingReactorClient([remote.config], {
        documentModelModules: [
          driveDocumentModelModule as unknown as DocumentModelModule,
        ],
        onDiagnostic: () => {},
      });
    };

    await expect(
      routerWith(undefined).createEmpty("powerhouse/document-drive"),
    ).rejects.toThrow("authentication required");
    const created = await routerWith(bearerToken).createEmpty(
      "powerhouse/document-drive",
    );
    expect(created.header.id).toBeTruthy();
  });

  it("rejects the token once the credential is revoked", async () => {
    // The fixture's renown-package predates `renown_revokeCredential`: the
    // wallet's app revokes the credential document itself, signed.
    await writerOf(appSigner, bearerToken).execute(
      credentialDocumentId,
      "main",
      [
        createAction("REVOKE", {
          revokedAt: new Date().toISOString(),
          reason: null,
        }),
      ],
    );
    await waitFor(
      async () => !(await credentialInReadModel()),
      60_000,
      () => `revocation never reached the read model. Logs:\n${run?.logs()}`,
    );

    const { status } = await createDocument(bearerToken);
    expect(status).toBe(401);
  }, 90_000);
});

describe("a switchboard without the renown package", () => {
  let run: RunningSwitchboard | undefined;

  afterAll(async () => {
    await stopSwitchboard(run);
  }, 30_000);

  // Its config still names the source "self": the setting is no longer read.
  it("boots, asks Renown at its URL, and says the source setting is ignored", async () => {
    for (const dir of [".ph", "dev.db"]) {
      rmSync(resolve(NOPKG_FIXTURE_DIR, dir), { recursive: true, force: true });
    }
    run = spawnSwitchboard(NOPKG_FIXTURE_DIR, {
      PH_SWITCHBOARD_PORT: String(NOPKG_PORT),
      AUTH_ENABLED: "true",
    });
    const boot = run;
    await waitFor(
      () =>
        Promise.resolve(
          boot
            .logs()
            .includes("RENOWN_SOURCE (auth.renown.source) is no longer read") &&
            boot.logs().includes("Credentials are checked against the records"),
        ),
      120_000,
      () => `boot did not log as expected. Logs:\n${boot.logs()}`,
    );
    expect(boot.logs()).not.toContain("serves the renown read model");
    expect(boot.exited()).toBe(false);
  }, 150_000);
});
