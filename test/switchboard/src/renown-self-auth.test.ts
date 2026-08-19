import { spawn, type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildAndSignCredential,
  MemoryKeyStorage,
  RenownCryptoBuilder,
  SwitchboardClient,
  type RenownCrypto,
} from "@renown/sdk/node";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// RENOWN_SOURCE=self e2e: seed a delegation credential with auth off, reboot
// with auth on, and assert bearer checks read this switchboard's own read model.

const SWITCHBOARD_BIN = resolve(
  import.meta.dirname,
  "../node_modules/.bin/switchboard",
);
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
  const proc = spawn(SWITCHBOARD_BIN, [], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
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
    credentialDocumentId = await readClient.issueCredential(
      credential,
      DEFAULT_DRIVE_ID,
    );
    await waitFor(
      credentialInReadModel,
      60_000,
      () => `credential never reached the read model. Logs:\n${run?.logs()}`,
    );
    await stopSwitchboard(run);

    // Phase 2 — auth on, cache off so revocation is observed immediately.
    run = spawnSwitchboard(FIXTURE_DIR, {
      PH_SWITCHBOARD_PORT: String(PORT),
      AUTH_ENABLED: "true",
      CREDENTIAL_VERIFICATION_CACHE_TTL_MS: "0",
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
      "verified against this switchboard's own renown read model",
    );
  });

  it("rejects a write without a bearer token", async () => {
    const { body } = await createDocument();
    expect(body.data?.createEmptyDocument ?? null).toBeNull();
    expect(body.errors?.length ?? 0).toBeGreaterThan(0);
  });

  it("accepts a bearer token whose delegation lives in the local read model", async () => {
    const { status, body } = await createDocument(bearerToken);
    expect(body.errors).toBeUndefined();
    expect(status).toBe(200);
    const created = body.data?.createEmptyDocument as { id: string };
    expect(created.id).toBeTruthy();
  });

  it("rejects a bearer token with no delegation credential", async () => {
    const { status } = await createDocument(strangerToken);
    expect(status).toBe(401);
  });

  it("rejects the token once the credential is revoked", async () => {
    // Same transport as gql() but authenticated, since writes now need auth.
    const authedClient = new SwitchboardClient(async (query, variables) => {
      const { status, body } = await gql(query, variables, bearerToken);
      if (status !== 200 || body.errors?.length) {
        throw new Error(
          `authenticated request failed (${status}): ${JSON.stringify(body.errors)}`,
        );
      }
      return body.data;
    });
    await authedClient.revokeCredential(credentialDocumentId);
    await waitFor(
      async () => !(await credentialInReadModel()),
      60_000,
      () => `revocation never reached the read model. Logs:\n${run?.logs()}`,
    );

    const { status } = await createDocument(bearerToken);
    expect(status).toBe(401);
  }, 90_000);
});

describe("self mode without the renown package", () => {
  let run: RunningSwitchboard | undefined;

  afterAll(async () => {
    await stopSwitchboard(run);
  }, 30_000);

  it("refuses to boot when no loaded package serves the read model", async () => {
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
          boot.logs().includes("renown-read-model") &&
            boot.logs().includes("RENOWN_SOURCE=remote"),
        ),
      120_000,
      () => `boot did not fail as expected. Logs:\n${boot.logs()}`,
    );
  }, 150_000);
});
