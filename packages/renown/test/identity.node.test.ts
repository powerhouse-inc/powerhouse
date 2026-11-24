import {
  listCredentialRecords,
  withdrawCredentialRecords,
} from "@powerhousedao/shared/clis/credential-records";
import {
  ensurePseudonym,
  loginPaths,
  readActiveIdentity,
} from "@powerhousedao/shared/clis/identity";
import { fileAccessList } from "@powerhousedao/shared/clis/owner-only";
import {
  didOfP256Jwk,
  readSessionFile,
  sessionFilePath,
  writeSessionFile,
} from "@powerhousedao/shared/clis/sessions";
import { carriedCredentialOf } from "../src/carried-credential.js";
import { createSignatureVerifier } from "../src/crypto/signer.js";
import { verifyAuthBearerToken } from "../src/utils.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAndSignCredential,
  recoverCredentialSigner,
  verifyCredentialSignature,
} from "../src/credential.js";
import { NodeKeyStorage } from "../src/crypto/node-key-storage.js";
import { RenownCryptoBuilder } from "../src/crypto/renown-crypto-builder.js";
import {
  LoginExpiredError,
  logoutHome,
  openSession,
  pollSessionApproval,
  readHomeLogin,
  resolveActiveIdentity,
  SessionApprovalRequiredError,
  SessionWithdrawnError,
  startSessionApproval,
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

/** A Renown wallet: it approves sessions at the console. */
const WALLET = privateKeyToAccount(`0x${"22".repeat(32)}`);

/** The credential `WALLET` signs for the session key `sessionDid`. */
function walletCredential(sessionDid: string) {
  return buildAndSignCredential({
    signTypedData: (args) =>
      WALLET.signTypedData(args as Parameters<typeof WALLET.signTypedData>[0]),
    address: WALLET.address,
    chainId: 1,
    app: "renown-app",
    appId: sessionDid,
  });
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

describe("openSession", () => {
  const store = () => path.join(root, "store");

  it("signs as the pseudonym through a labelled session, recorded in the store", async () => {
    const dataDir = store();
    const session = await openSession({
      dataDir,
      label: "vetra",
      place: "home",
      interactive: false,
      target: { dataDir },
      env,
    });
    const pseudonym = readActiveIdentity({ dataDir, env })!;
    expect(session.identity.address).toBe(pseudonym.address);
    expect(session.signer).toEqual({
      user: { address: pseudonym.address, networkId: "eip155", chainId: 1 },
      app: { name: "vetra", key: session.credential.credentialSubject.id },
    });
    expect(session.credential.credentialSubject.app).toBe("vetra");
    expect(await verifyCredentialSignature(session.credential)).toBe(true);

    const file = sessionFilePath({
      place: "home",
      label: "vetra",
      address: pseudonym.address,
      dataDir,
      env,
    });
    expectOwnerOnly(file);
    expect(didOfP256Jwk(readSessionFile(file)!.key.publicKey)).toBe(
      session.signer.app.key,
    );
    const [record] = listCredentialRecords({ dataDir });
    expect(record).toMatchObject({
      label: "vetra",
      source: "cli",
      sessionDid: session.signer.app.key,
    });

    const action = {
      id: "a1",
      type: "SET_NAME",
      scope: "global",
      timestampUtcMs: "1",
      input: { name: "x" },
    };
    const target = { documentId: "doc-1", branch: "main" };
    const tuple = await session.actionSigner.signAction(action, target);
    expect(tuple[1]).toBe(session.signer.app.key);
    const signed = {
      ...action,
      context: {
        signer: { ...session.signer, signatures: [tuple] },
      },
    };
    expect(
      await createSignatureVerifier()(
        { action: signed } as never,
        session.signer.app.key,
      ),
    ).toBe(true);
  });

  it("keeps its credential across opens and renews it near its end", async () => {
    const dataDir = store();
    const open = () =>
      openSession({
        dataDir,
        label: "vetra",
        place: "home",
        interactive: false,
        target: { dataDir },
        env,
      });
    const first = await open();
    const again = await open();
    expect(again.credential.id).toBe(first.credential.id);

    const file = sessionFilePath({
      place: "home",
      label: "vetra",
      address: first.identity.address,
      dataDir,
      env,
    });
    const held = readSessionFile(file)!;
    writeSessionFile(file, {
      ...held,
      credential: {
        ...held.credential!,
        expirationDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      },
    });
    const renewed = await open();
    expect(renewed.credential.id).not.toBe(first.credential.id);
    expect(
      Date.parse(renewed.credential.expirationDate!) - Date.now(),
    ).toBeGreaterThan(29 * 86_400_000);
    expect(listCredentialRecords({ dataDir })[0]?.credential.id).toBe(
      renewed.credential.id,
    );
  });

  it("signs with the held credential near its end while the key is locked", async () => {
    const dataDir = store();
    await ensurePseudonym({
      dataDir,
      env,
      password: "pw",
      kdf: { n: 1024, r: 8, p: 1, dklen: 32 },
    });
    const open = (o: { password?: string } = {}) =>
      openSession({
        dataDir,
        label: "vetra agent vetra-agent",
        place: "data-folder",
        interactive: false,
        target: { dataDir },
        env,
        ...o,
      });
    const first = await open({ password: "pw" });
    const file = sessionFilePath({
      place: "data-folder",
      label: "vetra agent vetra-agent",
      address: "",
      dataDir,
      env,
    });
    const endIn = (ms: number) => {
      const held = readSessionFile(file)!;
      writeSessionFile(file, {
        ...held,
        credential: {
          ...held.credential!,
          expirationDate: new Date(Date.now() + ms).toISOString(),
        },
      });
    };
    endIn(3 * 86_400_000);
    expect((await open()).credential.id).toBe(first.credential.id);
    endIn(-60_000);
    await expect(open()).rejects.toThrow(/locked with a password/);
  });

  it("issues a new credential where the store withdrew the old one", async () => {
    const dataDir = store();
    const first = await openSession({
      dataDir,
      label: "vetra",
      place: "home",
      interactive: false,
      target: { dataDir },
      env,
    });
    const [record] = listCredentialRecords({ dataDir });
    withdrawCredentialRecords({ dataDir, ids: [record!.id], by: "command" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await openSession({
      dataDir,
      label: "vetra",
      place: "home",
      interactive: false,
      target: { dataDir },
      env,
    });
    expect(second.credential.id).not.toBe(first.credential.id);
    expect(listCredentialRecords({ dataDir })[0]?.credential.id).toBe(
      second.credential.id,
    );
  });

  it("mints bearers that carry the credential", async () => {
    const dataDir = store();
    const session = await openSession({
      dataDir,
      label: "mcp test",
      place: "data-folder",
      interactive: false,
      env,
    });
    const verified = await verifyAuthBearerToken(await session.bearer());
    expect(verified).not.toBe(false);
    expect(verified && verified.issuer).toBe(session.signer.app.key);
    expect(verified && carriedCredentialOf(verified)?.id).toBe(
      session.credential.id,
    );
  });

  it("is the Renown login's own session for a person's tool, and needs approval for an agent", async () => {
    const { did } = await writeLogin();
    // The stored login carries the credential Renown issued for the key.
    const paths = loginPaths(env);
    const stored = JSON.parse(fs.readFileSync(paths.file, "utf8")) as {
      user: { credential: Record<string, unknown> };
    };
    stored.user.credential = {
      ...stored.user.credential,
      issuer: {
        id: `did:pkh:eip155:1:${ADDRESS.toLowerCase()}`,
        ethereumAddress: ADDRESS,
      },
      credentialSubject: { id: did, app: "renown-app" },
    };
    fs.writeFileSync(paths.file, JSON.stringify(stored));
    const session = await openSession({
      dataDir: store(),
      label: "vetra",
      place: "home",
      interactive: false,
      env,
    });
    expect(session.signer).toEqual({
      user: { address: ADDRESS, networkId: "eip155", chainId: 1 },
      app: { name: "renown-app", key: did },
    });
    await expect(
      openSession({
        dataDir: store(),
        label: "vetra agent vetra-agent",
        place: "data-folder",
        interactive: false,
        env,
      }),
    ).rejects.toThrow(SessionApprovalRequiredError);
  });

  it("signs as the wallet that approved a store session, whoever acts", async () => {
    const dataDir = store();
    await ensurePseudonym({ dataDir, env });
    const label = "vetra agent vetra-agent";
    const file = sessionFilePath({
      place: "data-folder",
      label,
      address: "",
      dataDir,
      env,
    });
    const { sessionDid } = startSessionApproval({ dataDir, label, env });
    const credential = await walletCredential(sessionDid);
    writeSessionFile(file, { ...readSessionFile(file)!, credential });
    const session = await openSession({
      dataDir,
      label,
      place: "data-folder",
      interactive: false,
      target: { dataDir },
      pseudonym: false,
      env,
    });
    expect(session.signer).toEqual({
      user: { address: WALLET.address, networkId: "eip155", chainId: 1 },
      app: { name: "renown-app", key: sessionDid },
    });
    expect(session.credential.id).toBe(credential.id);
    expect(listCredentialRecords({ dataDir })).toMatchObject([
      {
        address: WALLET.address.toLowerCase(),
        sessionDid,
        label: "renown-app",
      },
    ]);
  });

  it("refuses the pseudonym where only an approved session may sign", async () => {
    const dataDir = store();
    await expect(
      openSession({
        dataDir,
        label: "vetra agent vetra-agent",
        place: "data-folder",
        interactive: false,
        pseudonym: false,
        env,
      }),
    ).rejects.toThrow(SessionApprovalRequiredError);
    expect(readActiveIdentity({ dataDir, env })).toBeUndefined();
  });

  it("stays withdrawn where a session acting by itself was withdrawn", async () => {
    const dataDir = store();
    const open = () =>
      openSession({
        dataDir,
        label: "mcp test-client",
        place: "data-folder",
        interactive: false,
        target: { dataDir },
        reissueWithdrawn: false,
        env,
      });
    await open();
    const [record] = listCredentialRecords({ dataDir });
    withdrawCredentialRecords({ dataDir, ids: [record!.id], by: "command" });
    await expect(open()).rejects.toThrow(SessionWithdrawnError);
    expect(listCredentialRecords({ dataDir })).toEqual([]);
  });
});

describe("session approval at the console", () => {
  const store = () => path.join(root, "store");

  /** Renown's console and credential lookup, as a person approves at it. */
  function stubConsole(credential: () => unknown) {
    const asked: string[] = [];
    vi.stubGlobal("fetch", (input: string | URL) => {
      const url = new URL(String(input));
      asked.push(url.pathname);
      if (url.pathname.startsWith("/api/console/session/")) {
        return Promise.resolve(
          Response.json({
            status: "ready",
            address: WALLET.address,
            chainId: 1,
          }),
        );
      }
      if (url.pathname === "/api/auth/credential") {
        return Promise.resolve(Response.json({ credential: credential() }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    return asked;
  }

  it("names the session's key and label on the console page", () => {
    const approval = startSessionApproval({
      dataDir: store(),
      label: "mcp claude-code",
      renownUrl: RENOWN,
      env,
    });
    const url = new URL(approval.url);
    expect(url.origin + url.pathname).toBe(`${RENOWN}/console`);
    expect(url.searchParams.get("connect")).toBe(approval.sessionDid);
    expect(url.searchParams.get("app")).toBe("mcp claude-code");
    expect(url.searchParams.get("session")).toBe(approval.sessionId);
    expect(readSessionFile(approval.file)?.did).toBe(approval.sessionDid);
  });

  it("keeps the credential the wallet signed, and its record", async () => {
    const dataDir = store();
    const approval = startSessionApproval({
      dataDir,
      label: "vetra agent vetra-agent",
      renownUrl: RENOWN,
      env,
    });
    const credential = await walletCredential(approval.sessionDid);
    const asked = stubConsole(() => credential);
    const result = await pollSessionApproval({
      approval,
      renownUrl: RENOWN,
      timeoutMs: 0,
      target: { dataDir },
    });
    expect(result).toMatchObject({ status: "ready", address: WALLET.address });
    expect(asked).toContain("/api/auth/credential");
    expect(readSessionFile(approval.file)?.credential?.id).toBe(credential.id);
    expect(listCredentialRecords({ dataDir })).toHaveLength(1);
  });

  it("keeps nothing of a wallet it turns down", async () => {
    const dataDir = store();
    const approval = startSessionApproval({
      dataDir,
      label: "vetra agent vetra-agent",
      renownUrl: RENOWN,
      env,
    });
    const credential = await walletCredential(approval.sessionDid);
    stubConsole(() => credential);
    const result = await pollSessionApproval({
      approval,
      renownUrl: RENOWN,
      timeoutMs: 0,
      target: { dataDir },
      accept: () => false,
    });
    expect(result).toEqual({ status: "refused", address: WALLET.address });
    expect(readSessionFile(approval.file)?.credential).toBeUndefined();
    expect(listCredentialRecords({ dataDir })).toEqual([]);
  });
});
