import {
  ensurePseudonym,
  loginPaths,
} from "@powerhousedao/shared/clis/identity";
import { fileAccessList } from "@powerhousedao/shared/clis/owner-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  recoverCredentialSigner,
  verifyCredentialSignature,
} from "../src/credential.js";
import { NodeKeyStorage } from "../src/crypto/node-key-storage.js";
import { RenownCryptoBuilder } from "../src/crypto/renown-crypto-builder.js";
import {
  LoginExpiredError,
  logoutHome,
  readHomeLogin,
  resolveActiveIdentity,
  withdrawLogin,
} from "../src/identity.js";
import { NodeStorage } from "../src/storage/storage.node.js";

const ADDRESS = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const RENOWN = "https://renown.test";
const SWITCHBOARD = "https://switchboard.test/graphql";

let root: string;
let env: Record<string, string | undefined>;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "renown-identity-"));
  env = { PH_IDENTITY_HOME: path.join(root, "home") };
});
afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(root, { recursive: true, force: true });
});

function expectOwnerOnly(file: string) {
  if (process.platform === "win32") {
    expect(fileAccessList(file)).toHaveLength(1);
  } else {
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  }
}

/** A login as `ph login` leaves it: session key and Renown user. */
async function writeLogin(expiresInMs = 86_400_000) {
  const paths = loginPaths(env);
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new NodeKeyStorage(paths.keypair))
    .build();
  new NodeStorage(paths.file).set("user", {
    address: ADDRESS,
    chainId: 1,
    networkId: "eip155",
    did: `did:pkh:eip155:1:${ADDRESS.toLowerCase()}`,
    credential: {
      id: "urn:uuid:login-1",
      expirationDate: new Date(Date.now() + expiresInMs).toISOString(),
    },
  });
  return { paths, did: crypto.did };
}

/** Renown's discovery, then the switchboard's answer to the withdraw. */
function stubRenown(answer: () => Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/api/switchboard")) {
      return Promise.resolve(Response.json({ endpoint: SWITCHBOARD }));
    }
    return Promise.resolve(answer());
  });
  return calls;
}

describe("key files", () => {
  it("are written readable by the OS user only", async () => {
    const { paths } = await writeLogin();
    expectOwnerOnly(paths.keypair);
    expectOwnerOnly(paths.file);
  });
});

describe("resolveActiveIdentity", () => {
  it("signs as the pseudonym: a labelled credential for a session key", async () => {
    const dataDir = path.join(root, "store");
    const identity = await resolveActiveIdentity({
      dataDir,
      interactive: false,
      create: true,
      env,
    });
    expect(identity?.kind).toBe("pseudonym");
    const credential = await identity!.issueSessionCredential!(
      "did:key:zSession",
      { label: "agent X" },
    );
    expect(credential.credentialSubject).toEqual({
      id: "did:key:zSession",
      app: "agent X",
    });
    expect(await verifyCredentialSignature(credential)).toBe(true);
    expect((await recoverCredentialSigner(credential)).toLowerCase()).toBe(
      identity!.address.toLowerCase(),
    );
  });

  it("asks the password of a locked pseudonym, and none without one to ask", async () => {
    const dataDir = path.join(root, "locked");
    await ensurePseudonym({
      dataDir,
      env,
      password: "pw",
      kdf: { n: 1024, r: 8, p: 1, dklen: 32 },
    });
    const identity = await resolveActiveIdentity({
      dataDir,
      interactive: false,
      env,
    });
    await expect(identity!.signMessage!("hello")).rejects.toThrow(
      /locked with a password/,
    );
    const unlocked = await resolveActiveIdentity({
      dataDir,
      interactive: false,
      env: { ...env, PH_IDENTITY_PASSWORD: "pw" },
    });
    expect(await unlocked!.signMessage!("hello")).toMatch(/^0x[0-9a-f]{130}$/);
  });

  it("is the Renown login when there is one, and refuses an expired one", async () => {
    // Discovery finds no switchboard: the REST transport, and no network.
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response("no", { status: 404 })),
    );
    await writeLogin();
    const active = await resolveActiveIdentity({
      dataDir: root,
      interactive: false,
      env,
    });
    expect(active).toMatchObject({ kind: "renown", address: ADDRESS });
    expect(active?.signTypedData).toBeUndefined();
    expect((await active!.loginRenown!()).user?.address).toBe(ADDRESS);

    await writeLogin(-60_000);
    const expired = await resolveActiveIdentity({
      dataDir: root,
      interactive: false,
      env,
    });
    await expect(expired!.loginRenown!()).rejects.toThrow(LoginExpiredError);
  });
});

describe("readHomeLogin", () => {
  it("reads the session key and user without making either", async () => {
    expect(await readHomeLogin(env)).toBeUndefined();
    expect(fs.existsSync(loginPaths(env).keypair)).toBe(false);
    const { did } = await writeLogin();
    expect(await readHomeLogin(env)).toMatchObject({
      did,
      user: { address: ADDRESS },
    });
  });
});

describe("withdrawLogin and logoutHome", () => {
  it("withdraw with a bearer of the login's own session key", async () => {
    await writeLogin();
    const calls = stubRenown(() =>
      Response.json({ data: { renown_revokeCredential: true } }),
    );
    const result = await logoutHome({ renownUrl: RENOWN, env });
    expect(result.withdraw).toEqual({ status: "withdrawn" });
    const revoke = calls.find((call) => call.url === SWITCHBOARD)!.init!;
    const body = JSON.parse(revoke.body as string) as {
      query: string;
      variables: { credentialId: string };
    };
    expect(body.query).toContain("renown_revokeCredential");
    expect(body.variables.credentialId).toBe("urn:uuid:login-1");
    const headers = revoke.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer ey/);
    expect(result.removed).toHaveLength(2);
    expect(fs.existsSync(loginPaths(env).keypair)).toBe(false);
    expect(fs.existsSync(loginPaths(env).file)).toBe(false);
  });

  it("send the wallet to Renown's page when the bearer is refused", async () => {
    await writeLogin();
    stubRenown(() =>
      Response.json({ errors: [{ message: "Forbidden: not the issuer" }] }),
    );
    expect(await withdrawLogin({ renownUrl: RENOWN, env })).toEqual({
      status: "refused",
      reason: "Forbidden: not the issuer",
      revokeUrl: `${RENOWN}/me`,
    });
  });

  it("say when nothing can withdraw it", async () => {
    expect(await withdrawLogin({ renownUrl: RENOWN, env })).toEqual({
      status: "not-logged-in",
    });
    await writeLogin();
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response("no", { status: 404 })),
    );
    expect(await withdrawLogin({ renownUrl: RENOWN, env })).toMatchObject({
      status: "unavailable",
      reason: `${RENOWN} offers no withdraw`,
    });
  });
});
