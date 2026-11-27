// `ph token` against a host's real OAuth routes (reactor-api's), over HTTP, in
// a temp data folder; a pseudonym of its own; Renown out of reach. Nothing is
// opened in a browser: the opener is the test's.
import {
  createHttpAdapter,
  HostSessions,
  HttpRouteService,
  mountOAuthRoutes,
} from "@powerhousedao/reactor-api";
import {
  credentialRecordId,
  readCredentialWithdrawal,
} from "@powerhousedao/shared/clis/credential-records";
import {
  listHostSessions,
  readHostSession,
} from "@powerhousedao/shared/clis/host-sessions";
import {
  resolveActiveIdentity,
  type ActiveIdentity,
} from "@renown/sdk/identity";
import {
  buildAndSignCredential,
  createCredentialVerifier,
} from "@renown/sdk/node";
import fs from "node:fs";
import type { Server } from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runTokenApprove,
  runTokenCreate,
  runTokenList,
  runTokenWithdraw,
  type TokenIo,
} from "../src/services/token.js";

// viem is the SDK's own dependency; ph-cli does not declare it.
type Account = {
  address: `0x${string}`;
  signTypedData(args: unknown): Promise<`0x${string}`>;
};
const { privateKeyToAccount } = createRequire(
  import.meta.resolve("@renown/sdk/node"),
)("viem/accounts") as {
  privateKeyToAccount: (key: `0x${string}`) => Account;
};

// A well-known Anvil dev key: the wallet of the Renown login below.
const WALLET = privateKeyToAccount(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
);

type Host = {
  url: string;
  dataDir: string;
  sessions: HostSessions;
  close(): Promise<void>;
};

let root: string;
const hosts: Host[] = [];
let person: ActiveIdentity;
let out: string[];
let err: string[];
let opened: string[];
let answers: boolean[];

async function host(o: { publicOrigin?: string } = {}): Promise<Host> {
  const dataDir = fs.mkdtempSync(path.join(root, "store-"));
  const verifier = createCredentialVerifier({ dataDir, watch: false });
  const sessions = new HostSessions({ dataDir, verifier, watch: false });
  const { adapter } = await createHttpAdapter("express");
  adapter.setupMiddleware({});
  const server: Server = await adapter.listen(0, undefined, "127.0.0.1");
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const routes = new HttpRouteService({ httpAdapter: adapter });
  const mounted = mountOAuthRoutes(routes.hostScope("oauth", "/oauth"), {
    dataDir,
    publicOrigin: o.publicOrigin,
    basePath: "/",
    renownUrl: "https://renown.test",
    hostDid: () => "did:key:zHost",
    onWithdrawn: () => undefined,
  });
  const held: Host = {
    url,
    dataDir,
    sessions,
    close: async () => {
      mounted.dispose();
      sessions.close();
      verifier.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
  hosts.push(held);
  return held;
}

function io(identity: ActiveIdentity = person): TokenIo {
  return {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    ask: () => Promise.resolve(answers.shift()),
    open: (url) => opened.push(url),
    sleep: () => Promise.resolve(),
    interactive: false,
    env: { PH_IDENTITY_HOME: path.join(root, "home") },
    identity: () => Promise.resolve(identity),
  };
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-cli-token-"));
  person = (await resolveActiveIdentity({
    dataDir: path.join(root, "person"),
    interactive: false,
    create: true,
    env: { PH_IDENTITY_HOME: path.join(root, "home") },
  }))!;
  out = [];
  err = [];
  opened = [];
  answers = [];
});

afterEach(async () => {
  for (const held of hosts.splice(0)) await held.close();
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("ph token create", () => {
  it("with a pseudonym, approves after asking, and prints only the token", async () => {
    const sb = await host();
    answers = [true];
    expect(
      await runTokenCreate({ url: sb.url, label: "billing", days: 7 }, io()),
    ).toBe(0);
    expect(out).toHaveLength(1);
    const token = out[0];
    expect(token).toMatch(/^phs_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$/);
    // What the person saw before saying yes: the consent page's details.
    const shown = err.join("\n");
    for (const detail of [
      `Host      ${sb.url} (did:key:zHost)`,
      'Session   "billing"',
      "May       sign document changes as you; no administration",
      "(7 days)",
      "Asked by  ph-cli",
      "From      127.0.0.1",
      "Approve only a code you started yourself in the last 10 minutes.",
    ]) {
      expect(shown, detail).toContain(detail);
    }
    expect(await sb.sessions.verify(token)).toMatchObject({
      ok: true,
      user: { address: person.address, label: "billing" },
    });
  });

  it("denies the grant and prints no token when the answer is no", async () => {
    const sb = await host();
    answers = [false];
    expect(await runTokenCreate({ url: sb.url }, io())).toBe(1);
    expect(out).toEqual([]);
    expect(err.join("\n")).toContain("Denied");
  });

  it("asks nothing with --yes, and prints the token's JSON with --json", async () => {
    const sb = await host();
    expect(
      await runTokenCreate({ url: sb.url, yes: true, json: true }, io()),
    ).toBe(0);
    expect(JSON.parse(out.join("\n"))).toMatchObject({
      token_type: "Bearer",
      ph_label: "ph token",
      ph_address: person.address,
    });
  });

  it("with a Renown login, sends the person to the host's page and waits for the approval there", async () => {
    const sb = await host();
    const login = {
      kind: "renown",
      address: WALLET.address,
      label: "0x3C44...93BC",
    } as unknown as ActiveIdentity;
    const run = io(login);
    let approvedOnce = false;
    // The person approves on the page (as Renown's console would sign).
    run.sleep = async () => {
      if (approvedOnce) return;
      approvedOnce = true;
      const code = new URL(opened[0]).searchParams.get("user_code")!;
      const pending = (await (
        await fetch(`${sb.url}/oauth/device/pending?user_code=${code}`)
      ).json()) as { session_did: string; nonce: string };
      const credential = await buildAndSignCredential({
        signTypedData: (args) => WALLET.signTypedData(args),
        address: WALLET.address,
        chainId: 1,
        app: "ph token",
        appId: pending.session_did,
        expiresInDays: 30,
      });
      await fetch(`${sb.url}/oauth/device/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_code: code,
          credential,
          nonce: pending.nonce,
        }),
      });
    };
    expect(await runTokenCreate({ url: sb.url }, run)).toBe(0);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(
      new RegExp(`^${sb.url}/oauth/device\\?user_code=`),
    );
    expect(err.join("\n")).toContain(opened[0]);
    expect(out[0]).toMatch(/^phs_/);
  });

  it("--replace withdraws the old session once the new token is issued", async () => {
    const sb = await host();
    await runTokenCreate({ url: sb.url, label: "billing", yes: true }, io());
    const old = out.pop()!;
    expect(
      await runTokenCreate(
        {
          url: sb.url,
          label: "billing",
          yes: true,
          replace: "billing",
          dataDir: sb.dataDir,
        },
        io(),
      ),
    ).toBe(0);
    const fresh = out.pop()!;
    expect((await sb.sessions.verify(old)).ok).toBe(false);
    expect((await sb.sessions.verify(fresh)).ok).toBe(true);
    expect(listHostSessions({ dataDir: sb.dataDir })).toHaveLength(1);
  });
});

describe("ph token approve", () => {
  it("refuses a code another host issued", async () => {
    // A host that names itself https://elsewhere.example in its codes.
    const sb = await host({ publicOrigin: "https://elsewhere.example" });
    const started = (await (
      await fetch(`${sb.url}/oauth/device_authorization`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "client_id=curl&ph_label=billing",
      })
    ).json()) as { user_code: string };
    expect(
      await runTokenApprove(
        { code: started.user_code, url: sb.url, yes: true },
        io(),
      ),
    ).toBe(1);
    expect(err.join("\n")).toContain(
      `is https://elsewhere.example's, not ${sb.url}'s`,
    );
    expect(listHostSessions({ dataDir: sb.dataDir })[0]?.credential).toBe(
      undefined,
    );
  });

  it("says when a code is unknown, and when nobody can be asked", async () => {
    const sb = await host();
    expect(
      await runTokenApprove({ code: "BBBB-BBBB", url: sb.url }, io()),
    ).toBe(1);
    expect(err.join("\n")).toContain("knows no code BBBB-BBBB");
    const started = (await (
      await fetch(`${sb.url}/oauth/device_authorization`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "client_id=curl",
      })
    ).json()) as { user_code: string };
    // No answer: no terminal.
    expect(
      await runTokenApprove({ code: started.user_code, url: sb.url }, io()),
    ).toBe(1);
    expect(err.join("\n")).toContain("pass --yes");
  });
});

describe("ph token list and withdraw", () => {
  it("lists the store's sessions, and withdraws one by id prefix and one by label", async () => {
    const sb = await host();
    await runTokenCreate({ url: sb.url, label: "billing", yes: true }, io());
    await runTokenCreate({ url: sb.url, label: "reports", yes: true }, io());
    const [billing, reports] = out.splice(0);
    out = [];
    expect(await runTokenList({ dataDir: sb.dataDir }, io())).toBe(0);
    expect(out[0]).toMatch(
      /^ID\s+LABEL\s+WHO\s+GRANT\s+CLIENT\s+CREATED\s+ENDS\s+LAST USED\s+STATE$/,
    );
    expect(out.find((line) => line.includes("billing"))).toMatch(
      /billing\s+0x[0-9a-fA-F]{4}\.\.\.[0-9a-fA-F]{4}\s+device\s+ph-cli\s+.*live$/,
    );
    expect(out.filter((line) => line.includes("live"))).toHaveLength(2);

    const id = /^phs_([0-9a-f]{32})_/.exec(billing)![1];
    expect(
      await runTokenWithdraw(
        { target: id.slice(0, 8), dataDir: sb.dataDir },
        io(),
      ),
    ).toBe(0);
    expect((await sb.sessions.verify(billing)).ok).toBe(false);
    expect(readHostSession({ dataDir: sb.dataDir, id })).toBeUndefined();
    expect(
      await runTokenWithdraw({ target: "reports", dataDir: sb.dataDir }, io()),
    ).toBe(0);
    expect((await sb.sessions.verify(reports)).ok).toBe(false);
    expect(
      await runTokenWithdraw({ target: "reports", dataDir: sb.dataDir }, io()),
    ).toBe(1);
    expect(err.at(-1)).toBe("No host session reports.");
  });

  it("writes the tombstone, so the withdrawal holds", async () => {
    const sb = await host();
    await runTokenCreate({ url: sb.url, label: "billing", yes: true }, io());
    const [session] = listHostSessions({ dataDir: sb.dataDir });
    await runTokenWithdraw({ target: "billing", dataDir: sb.dataDir }, io());
    expect(
      readCredentialWithdrawal({
        dataDir: sb.dataDir,
        id: credentialRecordId({
          address: person.address,
          chainId: 1,
          sessionDid: session!.did,
        }),
      })?.by,
    ).toBe("command");
  });

  it("refuses a label two sessions share, naming them", async () => {
    const sb = await host();
    await runTokenCreate({ url: sb.url, label: "billing", yes: true }, io());
    await runTokenCreate({ url: sb.url, label: "billing", yes: true }, io());
    expect(
      await runTokenWithdraw({ target: "billing", dataDir: sb.dataDir }, io()),
    ).toBe(1);
    expect(err.at(-1)).toMatch(/^billing names 2 host sessions/);
  });
});
