/**
 * F3d end to end: a page signs in by link at the Connect server's loopback
 * endpoint, and its writes at a real switchboard are signed by its own
 * session key as the person's pseudonym, under the label "connect".
 *
 * A real switchboard in this process (in memory, its data folder the
 * project), the built Connect server with the sign-in endpoint and the real
 * issuer, and a page: a session key in memory, exchanging a one-time code
 * and writing through the GraphQL client with that key. Withdrawing the
 * credential's record in the store refuses the page's next request.
 */
import { GraphQLReactorClient } from "@powerhousedao/reactor-browser/graphql-client";
import {
  listCredentialRecords,
  withdrawCredentialRecords,
} from "@powerhousedao/shared/clis/credential-records";
import { readActiveIdentity } from "@powerhousedao/shared/clis/identity";
import {
  mintSignInCode,
  newSignInSecret,
} from "@powerhousedao/shared/clis/local-sign-in";
import {
  startSwitchboard,
  type SwitchboardReactor,
} from "@powerhousedao/switchboard/server";
import {
  createSignatureVerifier,
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
  type PowerhouseVerifiableCredential,
} from "@renown/sdk";
import { createLocalSignInIssuer } from "@renown/sdk/local-sign-in";
import { documentModelDocumentModelModule } from "document-model";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runConnectServer } from "@powerhousedao/ph-run/connect-server";

let root: string;
let project: string;
let home: string;
let switchboard: SwitchboardReactor | undefined;
let connect: { resolvedUrls: { local: string[] }; close(): Promise<void> };
const secret = newSignInSecret();

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-local-sign-in-"));
  project = path.join(root, "project");
  home = path.join(root, "identities");
  const dist = path.join(root, "dist");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(project, "powerhouse.config.json"), "{}");
  fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html>");
  fs.writeFileSync(path.join(dist, "powerhouse.config.json"), "{}");

  switchboard = await startSwitchboard(
    {
      server: { port: 0, host: "127.0.0.1" },
      storage: { inMemory: true, userDataDir: project },
      features: { workflows: false, mcp: false },
      packages: { disableLocal: true, list: [] },
      identity: {
        keypairPath: path.join(root, "switchboard", ".keypair.json"),
        storagePath: path.join(root, "switchboard", ".renown.json"),
      },
      protocol: { createSignaturePolicy: "legacy" },
    },
    { signalHandlers: false, fatalErrorShutdown: false },
  );
  connect = await runConnectServer(
    { outDir: dist, port: 0, host: "127.0.0.1", strictPort: true } as never,
    undefined,
    dist,
    {
      localSignIn: {
        secret,
        issuer: () =>
          Promise.resolve(
            createLocalSignInIssuer({
              dataDir: project,
              env: { PH_IDENTITY_HOME: home },
            }),
          ),
      },
    },
  );
}, 120_000);

afterAll(async () => {
  await connect.close();
  await switchboard?.shutdown();
  fs.rmSync(root, { recursive: true, force: true });
}, 60_000);

/** A page of this Connect: its session key, and its sign-in by a code. */
async function page() {
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  const origin = new URL(connect.resolvedUrls.local[0]!).origin;
  const response = await fetch(`${origin}/__ph/sign-in`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({
      code: mintSignInCode(secret, origin),
      sessionDid: crypto.did,
    }),
  });
  expect(response.status).toBe(200);
  const { credential } = (await response.json()) as {
    credential: PowerhouseVerifiableCredential;
  };
  const address = credential.issuer.ethereumAddress;
  const bearer = () =>
    crypto.getBearerToken(address, { expiresIn: 600, credential });
  return { crypto, credential, address, bearer };
}

describe("sign-in by link", () => {
  it("lets a page sign its writes at the switchboard as the person, labelled connect", async () => {
    const tab = await page();
    const person = readActiveIdentity({
      dataDir: project,
      env: { PH_IDENTITY_HOME: home },
    });
    expect(person?.kind).toBe("pseudonym");
    expect(tab.address).toBe(person!.address);
    expect(listCredentialRecords({ dataDir: project })).toMatchObject([
      { sessionDid: tab.crypto.did, label: "connect", source: "browser" },
    ]);

    const client = new GraphQLReactorClient({
      url: `http://127.0.0.1:${switchboard!.port}/graphql`,
      documentModels: [documentModelDocumentModelModule],
      signer: new RenownCryptoSigner(tab.crypto, "connect", {
        address: tab.address,
        networkId: "eip155",
        chainId: 1,
      }),
      tokenProvider: tab.bearer,
      realtime: false,
    });
    const created = await client.create(
      await client.newDocument("powerhouse/document-model"),
    );
    const listed = await switchboard!.reactor.getOperations(
      created.header.id,
      undefined,
      undefined,
      { cursor: "", limit: 100 },
    );
    const operations = listed.results;
    expect(operations.map((op) => op.action.type)).toContain("CREATE_DOCUMENT");
    const verify = createSignatureVerifier(true);
    for (const operation of operations) {
      const signer = operation.action.context?.signer;
      expect(signer?.user.address).toBe(tab.address);
      expect(signer?.app).toEqual({ name: "connect", key: tab.crypto.did });
      expect(await verify(operation, tab.crypto.did)).toBe(true);
    }
  }, 120_000);

  it("refuses the page's next request once the store withdraws its credential", async () => {
    const tab = await page();
    const graphql = `http://127.0.0.1:${switchboard!.port}/graphql`;
    const ask = async () =>
      fetch(graphql, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await tab.bearer()}`,
        },
        body: JSON.stringify({ query: "{ __typename }" }),
      });
    expect((await ask()).status).toBe(200);
    const ids = listCredentialRecords({ dataDir: project })
      .filter((record) => record.sessionDid === tab.crypto.did)
      .map((record) => record.id);
    withdrawCredentialRecords({ dataDir: project, ids, by: "command" });
    const refused = await ask();
    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({ reason: "withdrawn-here" });
  }, 60_000);
});
