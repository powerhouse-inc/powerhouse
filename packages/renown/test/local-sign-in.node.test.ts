import {
  listCredentialRecords,
  withdrawCredentialRecords,
  writeCredentialRecord,
  type CredentialLike,
} from "@powerhousedao/shared/clis/credential-records";
import {
  ensurePseudonym,
  loginPaths,
  readActiveIdentity,
} from "@powerhousedao/shared/clis/identity";
import type {
  LocalSignInIssued,
  LocalSignInIssuer,
} from "@powerhousedao/shared/clis/local-sign-in";
import {
  readSessionFile,
  sessionFilePath,
  writeSessionFile,
} from "@powerhousedao/shared/clis/sessions";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyCredentialSignature } from "../src/credential.js";
import { MemoryKeyStorage } from "../src/crypto/memory-key-storage.js";
import { RenownCryptoBuilder } from "../src/crypto/renown-crypto-builder.js";
import { resolveActiveIdentity } from "../src/identity.js";
import { createLocalSignInIssuer } from "../src/local-sign-in.js";
import type { PowerhouseVerifiableCredential } from "../src/types.js";

const AGENT = "vetra agent vetra-agent";
const CHEAP_KDF = { n: 1024, r: 8, p: 1, dklen: 32 };
const DAY = 86_400_000;

let root: string;
let dataDir: string;
let env: Record<string, string | undefined>;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "renown-local-sign-in-"));
  dataDir = path.join(root, "store");
  env = { PH_IDENTITY_HOME: path.join(root, "home") };
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** A page: its session key, and bearers that carry its credential. */
async function page() {
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  return {
    did: crypto.did,
    bearer: (issued: { credential: unknown }) =>
      crypto.getBearerToken(
        (issued.credential as PowerhouseVerifiableCredential).issuer
          .ethereumAddress,
        {
          expiresIn: 600,
          credential: issued.credential as PowerhouseVerifiableCredential,
        },
      ),
  };
}

function issued(result: unknown): LocalSignInIssued {
  expect(result).toMatchObject({ ok: true });
  return result as LocalSignInIssued;
}

function agentFile() {
  return sessionFilePath({
    place: "data-folder",
    label: AGENT,
    address: "",
    dataDir,
    env,
  });
}

async function locked(): Promise<LocalSignInIssuer> {
  await ensurePseudonym({ dataDir, env, password: "pw", kdf: CHEAP_KDF });
  return createLocalSignInIssuer({ dataDir, sessions: [AGENT], env });
}

describe("createLocalSignInIssuer", () => {
  it("issues a 30-day connect credential for the page's key, recorded as the browser's", async () => {
    const issuer = createLocalSignInIssuer({ dataDir, env });
    const { did } = await page();
    const result = issued(await issuer.signIn({ sessionDid: did }));
    // Nobody logged in and no pseudonym: it is made at this signature.
    const person = readActiveIdentity({ dataDir, env })!;
    expect(person.kind).toBe("pseudonym");
    const credential = result.credential as PowerhouseVerifiableCredential;
    expect(credential.credentialSubject).toEqual({ id: did, app: "connect" });
    expect(credential.issuer.ethereumAddress).toBe(person.address);
    expect(await verifyCredentialSignature(credential)).toBe(true);
    const lifetime = Date.parse(result.expiresAt) - Date.now();
    expect(lifetime).toBeGreaterThan(29 * DAY);
    expect(lifetime).toBeLessThanOrEqual(30 * DAY);
    expect(Date.parse(result.expiresAt) - Date.parse(result.renewFrom)).toBe(
      7 * DAY,
    );
    expect(result.identity).toEqual({
      kind: "pseudonym",
      address: person.address,
      label: expect.stringMatching(/^Anonymous 0x/) as string,
    });
    expect(listCredentialRecords({ dataDir })).toMatchObject([
      { sessionDid: did, label: "connect", source: "browser" },
    ]);
    // A plain key leaves the declared sessions to issue their own.
    expect(result.sessions).toEqual([]);
  });

  it("refuses a session key that is no did:key", async () => {
    const issuer = createLocalSignInIssuer({ dataDir, env });
    expect(await issuer.signIn({ sessionDid: "did:pkh:eip155:1:0x1" })).toEqual(
      { ok: false, status: 400, reason: "bad-session" },
    );
  });

  it("asks a locked key's password, refuses a wrong one, and unlocks once", async () => {
    const issuer = await locked();
    const { did } = await page();
    expect(await issuer.signIn({ sessionDid: did })).toEqual({
      ok: false,
      status: 423,
      reason: "password-required",
    });
    expect(await issuer.signIn({ sessionDid: did, password: "no" })).toEqual({
      ok: false,
      status: 401,
      reason: "wrong-password",
    });
    const result = issued(
      await issuer.signIn({ sessionDid: did, password: "pw" }),
    );
    // The declared session that cannot ask got its credential too.
    expect(result.sessions).toEqual([
      { label: AGENT, expiresAt: expect.any(String) as string },
    ]);
    const agent = readSessionFile(agentFile())!;
    expect(agent.credential?.credentialSubject).toEqual({
      id: agent.did,
      app: AGENT,
    });
    expect(
      listCredentialRecords({ dataDir }).map((r) => [r.label, r.source]),
    ).toEqual(
      expect.arrayContaining([
        ["connect", "browser"],
        [AGENT, "cli"],
      ]),
    );
    // Kept unlocked in memory: no password again while the process runs.
    const other = await page();
    issued(await issuer.signIn({ sessionDid: other.did }));
  });

  it("renews for a bearer that carries a credential it issued, and nothing else", async () => {
    const issuer = createLocalSignInIssuer({ dataDir, env });
    const tab = await page();
    const first = issued(await issuer.signIn({ sessionDid: tab.did }));
    const renewed = issued(
      await issuer.renew({ bearer: await tab.bearer(first) }),
    );
    const credential = renewed.credential as PowerhouseVerifiableCredential;
    expect(credential.id).not.toBe(
      (first.credential as PowerhouseVerifiableCredential).id,
    );
    expect(credential.credentialSubject.id).toBe(tab.did);

    // A credential another key signed is no credential of this computer's.
    const stranger = await page();
    const elsewhere = createLocalSignInIssuer({
      dataDir: path.join(root, "elsewhere"),
      env: { PH_IDENTITY_HOME: path.join(root, "home-2") },
    });
    const foreign = issued(
      await elsewhere.signIn({ sessionDid: stranger.did }),
    );
    expect(
      await issuer.renew({ bearer: await stranger.bearer(foreign) }),
    ).toEqual({ ok: false, status: 401, reason: "not-issued-here" });
    expect(await issuer.renew({ bearer: "not a jwt" })).toEqual({
      ok: false,
      status: 401,
      reason: "bad-bearer",
    });

    // Withdrawn in the store: renewal refuses, and says why.
    const ids = listCredentialRecords({ dataDir }).map((r) => r.id);
    withdrawCredentialRecords({ dataDir, ids, by: "command" });
    expect(await issuer.renew({ bearer: await tab.bearer(renewed) })).toEqual({
      ok: false,
      status: 401,
      reason: "withdrawn",
    });
  });

  it("refuses to renew a credential past its date", async () => {
    const issuer = createLocalSignInIssuer({ dataDir, env });
    const tab = await page();
    const person = await resolveActiveIdentity({
      dataDir,
      interactive: false,
      create: true,
      env,
    });
    const credential = await person!.issueSessionCredential!(tab.did, {
      label: "connect",
      expiresInDays: -1,
    });
    writeCredentialRecord({
      dataDir,
      credential: credential as CredentialLike,
      source: "browser",
    });
    expect(
      await issuer.renew({ bearer: await tab.bearer({ credential }) }),
    ).toEqual({ ok: false, status: 401, reason: "expired" });
  });

  it("leaves a Renown login to the page's own sign-in", async () => {
    const paths = loginPaths(env);
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(
      paths.file,
      JSON.stringify({
        user: {
          address: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
          chainId: 1,
          networkId: "eip155",
          did: "did:pkh:eip155:1:0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed",
          credential: {
            id: "urn:uuid:login-1",
            expirationDate: new Date(Date.now() + DAY).toISOString(),
          },
        },
      }),
    );
    const issuer = createLocalSignInIssuer({ dataDir, env });
    const { did } = await page();
    expect(await issuer.signIn({ sessionDid: did })).toMatchObject({
      ok: false,
      status: 409,
      reason: "renown-login",
      label: expect.any(String) as string,
    });
  });

  it("unlocks the declared sessions for a signed-in page, and no other", async () => {
    const issuer = await locked();
    const tab = await page();
    const first = issued(
      await issuer.signIn({ sessionDid: tab.did, password: "pw" }),
    );
    const bearer = await tab.bearer(first);
    expect(
      await issuer.unlock({ bearer, password: "pw", sessions: ["mcp other"] }),
    ).toEqual({ ok: false, status: 403, reason: "undeclared-session" });

    // After a restart the key is locked again: the page's bearer and the
    // password issue the agent's credential.
    fs.rmSync(agentFile());
    const restarted = createLocalSignInIssuer({
      dataDir,
      sessions: [AGENT],
      env,
    });
    expect(
      await restarted.unlock({ bearer, password: "no", sessions: [AGENT] }),
    ).toEqual({ ok: false, status: 401, reason: "wrong-password" });
    expect(
      await restarted.unlock({ bearer, password: "pw", sessions: [AGENT] }),
    ).toEqual({
      ok: true,
      sessions: [{ label: AGENT, expiresAt: expect.any(String) as string }],
    });
    expect(
      readSessionFile(agentFile())?.credential?.credentialSubject.app,
    ).toBe(AGENT);
  });

  it("renews the declared sessions near their end while unlocked", async () => {
    const issuer = await locked();
    expect(await issuer.renewSessions()).toEqual([]);
    const tab = await page();
    issued(await issuer.signIn({ sessionDid: tab.did, password: "pw" }));
    const before = readSessionFile(agentFile())!;
    // Far from its end: kept.
    expect(await issuer.renewSessions()).toEqual([
      { label: AGENT, expiresAt: before.credential!.expirationDate },
    ]);
    writeSessionFile(agentFile(), {
      ...before,
      credential: {
        ...before.credential!,
        expirationDate: new Date(Date.now() + 10 * DAY).toISOString(),
      },
    });
    const [renewed] = await issuer.renewSessions();
    expect(Date.parse(renewed!.expiresAt!) - Date.now()).toBeGreaterThan(
      29 * DAY,
    );
    expect(readSessionFile(agentFile())!.credential!.id).not.toBe(
      before.credential!.id,
    );
  });
});
