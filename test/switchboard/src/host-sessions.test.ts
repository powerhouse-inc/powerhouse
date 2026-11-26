import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GraphQLReactorClient } from "@powerhousedao/reactor-browser/graphql-client";
import {
  credentialRecordId,
  withdrawCredentialRecords,
} from "@powerhousedao/shared/clis/credential-records";
import type { Operation } from "@powerhousedao/shared/document-model";
import { testSigner } from "@powerhousedao/shared/testing";
import {
  buildAndSignCredential,
  type PowerhouseVerifiableCredential,
} from "@renown/sdk/node";
import { resolveActiveIdentity } from "@renown/sdk/identity";
import { documentModelDocumentModelModule } from "document-model";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SWITCHBOARD_COMMAND } from "./switchboard-bin.js";

// Host sessions on a real switchboard (F3e part 2): a pseudonym approves a
// device grant with a credential its own key signs, and the token then writes
// as "session <label> acting for" the pseudonym; revocation and withdrawal
// close it at the next request; an operator's token administers nothing; and
// a Renown login approves through the consent page's button, against a stub
// console. A temporary data folder and identity home: never the person's.

const PORT = 4024;
const ORIGIN = `http://localhost:${PORT}`;
const ENDPOINT = `${ORIGIN}/graphql`;
const DEVICE_CODE = "urn:ietf:params:oauth:grant-type:device_code";
// Well-known Anvil dev key #2: the Renown wallet of the console test.
const WALLET = privateKeyToAccount(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
);

let root = "";
let store = "";
let proc: ChildProcess | undefined;
let logs = "";
let renown: Server;
let renownUrl = "";
let person: Awaited<ReturnType<typeof resolveActiveIdentity>>;
const issued: string[] = [];
// The stub console's state: approved console sessions and their credentials.
const approvedConsoles = new Set<string>();
const credentials = new Map<string, PowerhouseVerifiableCredential>();

function startRenown(): Promise<void> {
  renown = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://renown.test");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const consoleSession = /^\/api\/console\/session\/(.+)$/.exec(
      url.pathname,
    )?.[1];
    if (consoleSession) {
      send(
        200,
        approvedConsoles.has(decodeURIComponent(consoleSession))
          ? { status: "ready", address: WALLET.address, chainId: 1 }
          : { status: "pending" },
      );
      return;
    }
    if (url.pathname === "/api/auth/credential") {
      const credential = credentials.get(url.searchParams.get("appId") ?? "");
      send(credential ? 200 : 404, credential ? { credential } : {});
      return;
    }
    send(404, {});
  });
  return new Promise((resolve) => {
    renown.listen(0, "127.0.0.1", () => {
      const address = renown.address();
      renownUrl = `http://127.0.0.1:${typeof address === "object" ? address?.port : 0}`;
      resolve();
    });
  });
}

async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs: number,
  what: string,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${what} after ${timeoutMs}ms. Logs:\n${logs.slice(-8000)}`);
}

function form(path: string, fields: Record<string, string>, headers = {}) {
  return fetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

type Started = { device_code: string; user_code: string };

async function startGrant(label: string, days = "7"): Promise<Started> {
  const response = await form("/oauth/device_authorization", {
    client_id: "e2e",
    ph_label: label,
    ph_days: days,
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as Started;
}

async function pendingOf(started: Started) {
  const response = await fetch(
    `${ORIGIN}/oauth/device/pending?user_code=${started.user_code}`,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    session_did: string;
    nonce: string;
    status: string;
  };
}

async function tokenOf(started: Started) {
  const response = await form("/oauth/token", {
    grant_type: DEVICE_CODE,
    device_code: started.device_code,
    client_id: "e2e",
  });
  const body = (await response.json()) as {
    access_token?: string;
    ph_session?: string;
    ph_address?: string;
    error?: string;
  };
  expect(response.status, JSON.stringify(body)).toBe(200);
  issued.push(body.access_token!);
  return body as Required<typeof body>;
}

/** A device grant the pseudonym approves through the approve route. */
async function pseudonymToken(label: string) {
  const started = await startGrant(label);
  const pending = await pendingOf(started);
  const credential = await person!.issueSessionCredential!(
    pending.session_did,
    { label, expiresInDays: 7 },
  );
  const approved = await fetch(`${ORIGIN}/oauth/device/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_code: started.user_code,
      credential,
      nonce: pending.nonce,
    }),
  });
  expect(approved.status, await approved.clone().text()).toBe(200);
  return { ...(await tokenOf(started)), sessionDid: pending.session_did };
}

async function graphql(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    data?: Record<string, unknown> | null;
    errors?: { message: string }[];
  };
  return { status: response.status, body };
}

const CREATE = /* GraphQL */ `
  mutation {
    DocumentModel {
      createEmptyDocument {
        id
      }
    }
  }
`;

async function operationsOf(id: string): Promise<Operation[]> {
  const reader = new GraphQLReactorClient({
    url: ENDPOINT,
    signer: await testSigner(),
    documentModels: [documentModelDocumentModelModule],
    realtime: false,
  });
  return (
    await reader.getOperations(id, undefined, undefined, {
      cursor: "0",
      limit: 1000,
    })
  ).results;
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "switchboard-host-sessions-"));
  store = join(root, "store");
  const home = join(root, "home");
  person = await resolveActiveIdentity({
    dataDir: join(root, "person"),
    interactive: false,
    create: true,
    env: { PH_IDENTITY_HOME: home },
  });
  await startRenown();
  // A store of its own, administered by the pseudonym.
  writeFileSync(
    join(root, "powerhouse.config.json"),
    JSON.stringify({ logLevel: "info" }),
  );
  proc = spawn(...SWITCHBOARD_COMMAND, {
    cwd: root,
    env: {
      ...process.env,
      PH_SWITCHBOARD_PORT: String(PORT),
      PH_USER_DATA_DIR: store,
      PH_IDENTITY_HOME: join(root, "switchboard-home"),
      ADMINS: person!.address,
      RENOWN_URL: renownUrl,
      // A registry mounts the package administration (`Packages`); the stub
      // serves nothing, and no install gets that far.
      PH_REGISTRY_URL: renownUrl,
      AUTH_ENABLED: "false",
      BROWSER: "none",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  proc.stdout?.on("data", (chunk: Buffer) => (logs += chunk.toString()));
  proc.stderr?.on("data", (chunk: Buffer) => (logs += chunk.toString()));
  await waitFor(
    async () => (await fetch(`${ORIGIN}/ready`)).status === 200,
    120_000,
    "The switchboard was not ready",
  );
}, 180_000);

afterAll(async () => {
  const running = proc;
  if (running && running.exitCode === null) {
    await new Promise<void>((done) => {
      running.once("close", () => done());
      running.kill();
      setTimeout(() => {
        running.kill("SIGKILL");
        done();
      }, 10_000).unref();
    });
  }
  await new Promise<void>((resolve) => renown.close(() => resolve()));
  rmSync(root, { recursive: true, force: true });
}, 30_000);

describe("a device grant a pseudonym approves", () => {
  let token = "";
  let sessionDid = "";
  let address = "";

  beforeAll(async () => {
    ({
      access_token: token,
      sessionDid,
      ph_address: address,
    } = await pseudonymToken("billing"));
  }, 60_000);

  it("is issued for the pseudonym", () => {
    expect(token).toMatch(/^phs_[0-9a-f]{32}_/);
    expect(address.toLowerCase()).toBe(person!.address.toLowerCase());
  });

  it("writes per-model and host-built mutations as the session acting for its user", async () => {
    const created = await graphql(CREATE, {}, token);
    expect(
      created.body.errors,
      JSON.stringify(created.body.errors),
    ).toBeUndefined();
    const id = (
      created.body.data!.DocumentModel as {
        createEmptyDocument: { id: string };
      }
    ).createEmptyDocument.id;
    const named = await graphql(
      /* GraphQL */ `
        mutation ($id: String!) {
          DocumentModel {
            setModelName(documentIdOrSlug: $id, input: { name: "Billing" }) {
              id
            }
          }
        }
      `,
      { id },
      token,
    );
    expect(
      named.body.errors,
      JSON.stringify(named.body.errors),
    ).toBeUndefined();
    const renamed = await graphql(
      /* GraphQL */ `
        mutation ($id: String!) {
          renameDocument(documentIdOrSlug: $id, name: "renamed") {
            name
          }
        }
      `,
      { id },
      token,
    );
    expect(
      renamed.body.errors,
      JSON.stringify(renamed.body.errors),
    ).toBeUndefined();

    const operations = await operationsOf(id);
    for (const type of ["SET_MODEL_NAME", "SET_NAME"]) {
      const operation = operations.findLast((op) => op.action.type === type);
      expect(operation, type).toBeDefined();
      const signer = operation!.action.context?.signer;
      expect(signer?.user.address.toLowerCase()).toBe(
        person!.address.toLowerCase(),
      );
      expect(signer?.app.key).toBe(sessionDid);
      expect(signer?.app.name).toBe("billing");
    }
  });

  it("administers nothing, though the pseudonym is in ADMINS", async () => {
    const { body } = await graphql(
      /* GraphQL */ `
        mutation {
          Packages {
            installPackage(name: "@powerhousedao/never-installed") {
              documentModelsLoaded
            }
          }
        }
      `,
      {},
      token,
    );
    expect(body.errors?.[0]?.message).toContain("Admin access required");
    expect(logs).toContain("administrative call refused");
  });

  it("is refused at the next request once its credential is withdrawn", async () => {
    const before = await graphql("{ __typename }", {}, token);
    expect(before.status).toBe(200);
    withdrawCredentialRecords({
      dataDir: store,
      ids: [
        credentialRecordId({
          address: person!.address,
          chainId: 1,
          sessionDid,
        }),
      ],
      by: "command",
    });
    expect((await graphql("{ __typename }", {}, token)).status).toBe(401);
  });
});

describe("revocation", () => {
  it("is a 401 at the next request", async () => {
    const { access_token: token } = await pseudonymToken("revoked");
    expect((await graphql("{ __typename }", {}, token)).status).toBe(200);
    expect((await form("/oauth/revoke", { token })).status).toBe(200);
    expect((await graphql("{ __typename }", {}, token)).status).toBe(401);
  }, 60_000);
});

describe("the consent page's Renown button", () => {
  it("sends the person to Renown's console, and a token follows their approval", async () => {
    const started = await startGrant("billing", "14");
    const page = await (
      await fetch(`${ORIGIN}/oauth/device?user_code=${started.user_code}`)
    ).text();
    const nonce = /name="nonce" value="([^"]+)"/.exec(page)?.[1];
    expect(nonce).toBeDefined();
    const sent = await fetch(`${ORIGIN}/oauth/device/renown`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: ORIGIN,
      },
      body: new URLSearchParams({
        user_code: started.user_code,
        nonce: nonce!,
      }).toString(),
    });
    expect(sent.status).toBe(303);
    const link = new URL(sent.headers.get("location")!);
    expect(link.origin + link.pathname).toBe(`${renownUrl}/console`);
    const params = Object.fromEntries(link.searchParams);
    expect(params).toMatchObject({
      app: "billing",
      host: ORIGIN,
      expiresInDays: "14",
    });

    // The person approves at the console: staging's Renown signs its own
    // label, which the host takes until Renown signs the asked one.
    credentials.set(
      params.connect!,
      await buildAndSignCredential({
        signTypedData: (args) =>
          WALLET.signTypedData(
            args as Parameters<typeof WALLET.signTypedData>[0],
          ),
        address: WALLET.address,
        chainId: 1,
        app: "renown-app",
        appId: params.connect!,
        expiresInDays: 14,
      }),
    );
    approvedConsoles.add(params.session!);
    await waitFor(
      async () => (await pendingOf(started)).status === "approved",
      30_000,
      "The host did not take Renown's approval",
    );
    const { access_token: token, ph_address } = await tokenOf(started);
    expect(ph_address.toLowerCase()).toBe(WALLET.address.toLowerCase());
    expect((await graphql("{ __typename }", {}, token)).status).toBe(200);
  }, 60_000);
});

describe("the switchboard's log", () => {
  it("names a session by its short id, never by its token", () => {
    expect(issued.length).toBeGreaterThan(0);
    for (const token of issued) {
      const [, id, secret] = /^phs_([0-9a-f]{32})_(.+)$/.exec(token)!;
      expect(logs).not.toContain(secret!);
      expect(logs).not.toContain(id!);
      expect(logs).toContain(`Host session ${id!.slice(0, 8)}`);
    }
  });
});
