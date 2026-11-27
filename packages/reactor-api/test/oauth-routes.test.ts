// The OAuth routes that issue host session tokens (F3e part 2): discovery,
// the device grant with its consent page and approvals, the token endpoint,
// revocation, and a person's own sessions. A real route service over Express,
// real files in a temp data folder, Renown out of reach.
import {
  credentialRecordId,
  readCredentialRecord,
  readCredentialWithdrawal,
  withdrawCredentialRecords,
  writeCredentialRecord,
  writeCredentialWithdrawal,
} from "@powerhousedao/shared/clis/credential-records";
import {
  readHostSession,
  type HostSessionFile,
} from "@powerhousedao/shared/clis/host-sessions";
import {
  buildAndSignCredential,
  createCredentialVerifier,
  MemoryKeyStorage,
  RenownCryptoBuilder,
  type CredentialVerifier,
  type PowerhouseVerifiableCredential,
} from "@renown/sdk/node";
import { mkdtempSync, rmSync } from "node:fs";
import { request, type Server } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpressHttpAdapter } from "../src/graphql/gateway/adapter-http-express.js";
import { HttpRouteService } from "../src/http/index.js";
import { listDeviceGrants } from "../src/http/oauth-grants.js";
import { mountOAuthMetadata } from "../src/http/oauth-metadata.js";
import {
  mountOAuthRoutes,
  RENOWN_APP_LABEL,
  type OAuthRoutesOptions,
} from "../src/http/oauth-routes.js";
import { AuthService } from "../src/services/auth.service.js";
import { HostSessions } from "../src/services/host-sessions.js";

// viem is the SDK's own dependency; reactor-api does not declare it.
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
const STRANGER = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const DEVICE_CODE = "urn:ietf:params:oauth:grant-type:device_code";
const fetchOriginal = globalThis.fetch;

let dataDir: string;
let verifier: CredentialVerifier;
let sessions: HostSessions;
let server: Server;
let url: string;
let issuer: string;
let clock: number | undefined;
let disposeRoutes: () => void;
let withdrawn: string[];
let routes: HttpRouteService;

const now = () => clock ?? Date.now();

/** Mounts the routes again, with `extra` over the test's options. */
function remount(extra: Partial<OAuthRoutesOptions> = {}) {
  disposeRoutes();
  const mounted = mountOAuthRoutes(routes.hostScope("oauth", "/oauth"), {
    dataDir,
    publicOrigin: undefined,
    basePath: "/",
    renownUrl: "https://renown.test",
    hostDid: () => "did:key:zHostKey",
    onWithdrawn: (binding) => withdrawn.push(binding.sessionDid),
    now,
    ...extra,
  });
  disposeRoutes = () => mounted.dispose();
}

beforeEach(async () => {
  clock = undefined;
  withdrawn = [];
  dataDir = mkdtempSync(join(tmpdir(), "oauth-routes-"));
  verifier = createCredentialVerifier({ dataDir, watch: false });
  sessions = new HostSessions({ dataDir, verifier, watch: false });
  const authService = new AuthService({
    enabled: false,
    resolveIdentity: true,
    admins: [],
    credentialVerificationCacheTtlMs: 0,
    verifyCredential: (p) =>
      verifier.check(
        {
          address: p.address,
          chainId: p.chainId,
          networkId: p.networkId ?? "eip155",
          sessionDid: p.appId,
        },
        p.credential,
      ),
    hostSessions: sessions,
  });
  const adapter = new ExpressHttpAdapter();
  adapter.setupMiddleware({});
  server = await adapter.listen(0, undefined, "127.0.0.1");
  const port = (server.address() as { port: number }).port;
  url = `http://127.0.0.1:${port}`;
  issuer = url;
  routes = new HttpRouteService({ httpAdapter: adapter, authService });
  disposeRoutes = () => undefined;
  remount();
  mountOAuthMetadata(adapter, {
    publicOrigin: undefined,
    basePath: "/",
    mcp: true,
  });
});

afterEach(async () => {
  disposeRoutes();
  sessions.close();
  verifier.close();
  vi.restoreAllMocks();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

function form(path: string, fields: Record<string, string>, headers = {}) {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

function post(path: string, body: unknown, headers = {}) {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

type Started = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
};

async function start(fields: Record<string, string> = {}): Promise<Started> {
  const response = await form("/oauth/device_authorization", {
    client_id: "curl",
    ph_label: "billing",
    ...fields,
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as Started;
}

type Pending = {
  session_did: string;
  label: string;
  nonce: string;
  days: number;
  client_id: string;
  warning: string;
  may: string;
};

async function pendingOf(userCode: string): Promise<Pending> {
  const response = await fetch(
    `${url}/oauth/device/pending?user_code=${encodeURIComponent(userCode)}`,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as Pending;
}

const credentialFor = (
  account: Account,
  sessionDid: string,
  o: { label?: string; days?: number } = {},
): Promise<PowerhouseVerifiableCredential> =>
  buildAndSignCredential({
    signTypedData: (args) => account.signTypedData(args),
    address: account.address,
    chainId: 1,
    app: o.label ?? "billing",
    appId: sessionDid,
    expiresInDays: o.days ?? 30,
  });

async function approve(
  started: Started,
  o: { label?: string; days?: number; account?: Account; did?: string } = {},
) {
  const pending = await pendingOf(started.user_code);
  const credential = await credentialFor(
    o.account ?? PERSON,
    o.did ?? pending.session_did,
    o,
  );
  return post("/oauth/device/approve", {
    user_code: started.user_code,
    credential,
    nonce: pending.nonce,
  });
}

async function poll(started: Started, clientId = "curl") {
  const response = await form("/oauth/token", {
    grant_type: DEVICE_CODE,
    device_code: started.device_code,
    client_id: clientId,
  });
  return {
    status: response.status,
    headers: response.headers,
    body: (await response.json()) as Record<string, unknown>,
  };
}

describe("discovery", () => {
  it("lists the grants it serves and their endpoints, and nothing it does not serve", async () => {
    const response = await fetch(
      `${url}/.well-known/oauth-authorization-server`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      device_authorization_endpoint: `${issuer}/oauth/device_authorization`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      grant_types_supported: [DEVICE_CODE, "authorization_code"],
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
      authorization_response_iss_parameter_supported: true,
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["documents:write"],
    });
    const resource = await fetch(`${url}/.well-known/oauth-protected-resource`);
    expect(await resource.json()).toEqual({
      resource: issuer,
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: ["documents:write"],
    });
  });

  it("describes /mcp as a resource of its own, protected by this issuer", async () => {
    const response = await fetch(
      `${url}/.well-known/oauth-protected-resource/mcp`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      resource: `${issuer}/mcp`,
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: ["documents:write"],
    });
  });

  it("names no issuer for a request off loopback without a public URL", async () => {
    // fetch sends no Host of the caller's choosing; node:http does.
    const status = (method: string, path: string, body?: string) =>
      new Promise<number>((resolve, reject) => {
        const req = request(
          `${url}${path}`,
          {
            method,
            headers: {
              host: "switchboard.example",
              ...(body
                ? { "content-type": "application/x-www-form-urlencoded" }
                : {}),
            },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.on("error", reject);
        req.end(body);
      });
    expect(await status("GET", "/.well-known/oauth-authorization-server")).toBe(
      404,
    );
    expect(
      await status("POST", "/oauth/device_authorization", "client_id=curl"),
    ).toBe(503);
  });
});

describe("the device grant", () => {
  it("starts with a code to type, and keeps a session key nobody approved", async () => {
    const started = await start({ ph_days: "7" });
    expect(started.user_code).toMatch(
      /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/,
    );
    expect(started.device_code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(started).toMatchObject({
      verification_uri: `${issuer}/oauth/device`,
      verification_uri_complete: `${issuer}/oauth/device?user_code=${started.user_code}`,
      expires_in: 600,
      interval: 5,
    });
    const pending = await pendingOf(started.user_code.toLowerCase());
    expect(pending).toMatchObject({
      label: "billing",
      days: 7,
      client_id: "curl",
      may: "sign document changes as you; no administration",
      warning:
        "Approve only a code you started yourself in the last 10 minutes.",
    });
    expect(pending.session_did).toMatch(/^did:key:z/);
  });

  it("refuses what it cannot grant", async () => {
    const refusal = async (fields: Record<string, string>) => {
      const response = await form("/oauth/device_authorization", fields);
      return [
        response.status,
        ((await response.json()) as { error: string }).error,
      ];
    };
    expect(await refusal({})).toEqual([400, "invalid_request"]);
    expect(await refusal({ client_id: "c", scope: "documents:read" })).toEqual([
      400,
      "invalid_scope",
    ]);
    expect(await refusal({ client_id: "c", ph_days: "31" })).toEqual([
      400,
      "invalid_request",
    ]);
    expect(await refusal({ client_id: "c", ph_days: "0" })).toEqual([
      400,
      "invalid_request",
    ]);
    expect(await refusal({ client_id: "c", ph_label: "did:key:zX" })).toEqual([
      400,
      "invalid_request",
    ]);
  });

  it("answers a poll before approval as pending, and one too soon with slow_down", async () => {
    const started = await start();
    expect((await poll(started)).body.error).toBe("authorization_pending");
    const fast = await poll(started);
    expect(fast.body).toMatchObject({ error: "slow_down", interval: 10 });
    expect(fast.headers.get("cache-control")).toBe("no-store");
  });

  it("issues one token after approval, then no more", async () => {
    const started = await start();
    const approved = await approve(started);
    expect(approved.status, await approved.clone().text()).toBe(200);
    const issued = await poll(started);
    expect(issued.status).toBe(200);
    expect(issued.headers.get("cache-control")).toBe("no-store");
    expect(issued.body).toMatchObject({
      token_type: "Bearer",
      scope: "documents:write",
      ph_label: "billing",
      ph_address: PERSON.address,
    });
    const token = issued.body.access_token as string;
    expect(token).toMatch(/^phs_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$/);
    expect(issued.body.expires_in).toBeGreaterThan(29 * 86_400);
    const verdict = await sessions.verify(token);
    expect(verdict).toMatchObject({
      ok: true,
      user: { address: PERSON.address, via: "host-session", label: "billing" },
    });
    // The record is the host's, beside the others.
    const session = readHostSession({
      dataDir,
      id: issued.body.ph_session as string,
    }) as HostSessionFile;
    expect(
      readCredentialRecord({
        dataDir,
        id: credentialRecordId({
          address: PERSON.address,
          chainId: 1,
          sessionDid: session.did,
        }),
      })?.source,
    ).toBe("host-session");
    // Shown once.
    expect((await poll(started)).body.error).toBe("invalid_grant");
  });

  it("refuses a poll by another client, and a code that expired", async () => {
    const started = await start();
    expect((await poll(started, "someone-else")).body.error).toBe(
      "invalid_grant",
    );
    clock = Date.now() + 11 * 60_000;
    expect((await poll(started)).body.error).toBe("expired_token");
  });

  it("tells a client the person denied it", async () => {
    const started = await start();
    const pending = await pendingOf(started.user_code);
    const denied = await post("/oauth/device/deny", {
      user_code: started.user_code,
      nonce: pending.nonce,
    });
    expect(denied.status).toBe(200);
    expect((await poll(started)).body.error).toBe("access_denied");
  });
});

describe("an approval", () => {
  it("is refused for a credential naming another key", async () => {
    const started = await start();
    const other = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    const response = await approve(started, { did: other.did });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
  });

  it("is refused for a credential longer than asked, or than 30 days", async () => {
    const week = await start({ ph_days: "7" });
    expect((await approve(week, { days: 30 })).status).toBe(400);
    const month = await start();
    expect((await approve(month, { days: 31 })).status).toBe(400);
    expect((await approve(month, { days: 30 })).status).toBe(200);
  });

  it("is refused for another label, and takes Renown's until it signs labels", async () => {
    const started = await start();
    const wrong = await approve(started, { label: "something else" });
    expect(await wrong.json()).toMatchObject({
      error: "invalid_request",
      error_description: expect.stringContaining('"something else"') as unknown,
    });
    expect((await approve(started, { label: RENOWN_APP_LABEL })).status).toBe(
      200,
    );
  });

  it("is refused for a credential withdrawn here", async () => {
    const started = await start();
    const pending = await pendingOf(started.user_code);
    const credential = await credentialFor(PERSON, pending.session_did);
    writeCredentialWithdrawal({
      dataDir,
      binding: {
        address: PERSON.address,
        chainId: 1,
        sessionDid: pending.session_did,
      },
      by: "command",
      now: new Date(Date.now() + 1000),
    });
    const response = await post("/oauth/device/approve", {
      user_code: started.user_code,
      credential,
      nonce: pending.nonce,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "access_denied" });
  });

  it("is refused for a grant already approved", async () => {
    const started = await start();
    expect((await approve(started)).status).toBe(200);
    const again = await approve(started, { account: STRANGER });
    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("needs a nonce of the grant's page", async () => {
    const started = await start();
    const pending = await pendingOf(started.user_code);
    const credential = await credentialFor(PERSON, pending.session_did);
    for (const nonce of [undefined, "1.x", `${Date.now() + 60_000}.forged`]) {
      const response = await post("/oauth/device/approve", {
        user_code: started.user_code,
        credential,
        ...(nonce ? { nonce } : {}),
      });
      expect(response.status).toBe(403);
    }
  });
});

describe("the consent page", () => {
  it("shows what would be allowed and approves nothing by being opened", async () => {
    const started = await start();
    const response = await fetch(started.verification_uri_complete);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    // Not no-referrer: under it a browser sends `Origin: null` with the
    // page's own buttons.
    expect(response.headers.get("referrer-policy")).toBe("same-origin");
    const page = await response.text();
    for (const shown of [
      "billing",
      "curl",
      "may sign document changes as you on this host; no administration",
      "Approve only a code you started yourself in the last 10 minutes.",
      `ph token approve ${started.user_code} --url ${issuer}`,
      "127.0.0.1",
    ]) {
      expect(page, shown).toContain(shown);
    }
    expect((await poll(started)).body.error).toBe("authorization_pending");
  });

  it("asks for a code without one, and says so for an unknown one", async () => {
    const blank = await fetch(`${url}/oauth/device`);
    expect(blank.status).toBe(200);
    expect(await blank.text()).toContain('name="user_code"');
    const unknown = await fetch(`${url}/oauth/device?user_code=BBBB-BBBB`);
    expect(unknown.status).toBe(404);
  });

  it("takes its buttons only from this host's own pages", async () => {
    const started = await start();
    const pending = await pendingOf(started.user_code);
    const fields = { user_code: started.user_code, nonce: pending.nonce };
    const crossSite = await form("/oauth/device/deny", fields, {
      origin: "https://elsewhere.example",
    });
    expect(crossSite.status).toBe(403);
    const fetchedCrossSite = await form("/oauth/device/renown", fields, {
      origin: issuer,
      "sec-fetch-site": "cross-site",
    });
    expect(fetchedCrossSite.status).toBe(403);
    // `Origin: null` is this host's only where the browser says same-origin.
    for (const headers of [
      { origin: "null" },
      { origin: "null", "sec-fetch-site": "cross-site" },
      { origin: "null", "sec-fetch-site": "same-site" },
    ]) {
      const refused = await form("/oauth/device/deny", fields, headers);
      expect(refused.status, JSON.stringify(headers)).toBe(403);
    }
    expect((await poll(started)).body.error).toBe("authorization_pending");

    const denied = await form("/oauth/device/deny", fields, { origin: issuer });
    expect(denied.status).toBe(200);
    expect(await denied.text()).toContain("Denied");
  });

  it("takes a button posted with `Origin: null` from a same-origin page", async () => {
    const started = await start();
    const pending = await pendingOf(started.user_code);
    const denied = await form(
      "/oauth/device/deny",
      { user_code: started.user_code, nonce: pending.nonce },
      { origin: "null", "sec-fetch-site": "same-origin" },
    );
    expect(denied.status).toBe(200);
    expect((await poll(started)).body.error).toBe("access_denied");
  });

  it("sends a Renown login to Renown's console for the session's key", async () => {
    const started = await start({ ph_days: "14" });
    const pending = await pendingOf(started.user_code);
    // Renown answers nothing: the poll the button starts waits.
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const target = String(input instanceof Request ? input.url : input);
      return target.startsWith("https://renown.test")
        ? Promise.resolve(Response.json({ status: "pending" }))
        : fetchOriginal(input, init);
    });
    const response = await fetchOriginal(`${url}/oauth/device/renown`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: issuer,
      },
      body: new URLSearchParams({
        user_code: started.user_code,
        nonce: pending.nonce,
      }).toString(),
    });
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(
      "https://renown.test/console",
    );
    expect(Object.fromEntries(location.searchParams)).toMatchObject({
      connect: pending.session_did,
      app: "billing",
      host: issuer,
      expiresInDays: "14",
    });
  });
});

describe("revocation", () => {
  it("answers 200 for a token it does not know", async () => {
    for (const token of [
      "nonsense",
      `phs_${"a".repeat(32)}_${"b".repeat(43)}`,
    ]) {
      expect((await form("/oauth/revoke", { token })).status).toBe(200);
    }
    expect((await form("/oauth/revoke", {})).status).toBe(400);
  });

  it("withdraws the session a token names, as `ph credentials withdraw` would", async () => {
    const started = await start();
    await approve(started);
    const { body } = await poll(started);
    const token = body.access_token as string;
    const session = readHostSession({
      dataDir,
      id: body.ph_session as string,
    })!;
    expect((await form("/oauth/revoke", { token })).status).toBe(200);
    expect((await sessions.verify(token)).ok).toBe(false);
    expect(
      readCredentialWithdrawal({
        dataDir,
        id: credentialRecordId({
          address: PERSON.address,
          chainId: 1,
          sessionDid: session.did,
        }),
      })?.by,
    ).toBe("request");
    expect(readHostSession({ dataDir, id: session.id })).toBeUndefined();
    expect(withdrawn).toEqual([session.did]);
  });
});

describe("a person's sessions", () => {
  async function selfSignedBearer(account: Account) {
    const key = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    const credential = await credentialFor(account, key.did, {
      label: "ph-cli",
    });
    writeCredentialRecord({ dataDir, credential, source: "cli" });
    return key.getBearerToken(account.address, { expiresIn: 60 });
  }

  it("lists and withdraws them for their own bearer only", async () => {
    const started = await start();
    await approve(started);
    const { body } = await poll(started);
    const id = body.ph_session as string;
    const mine = await selfSignedBearer(PERSON);
    const listed = await fetch(`${url}/oauth/sessions`, {
      headers: { authorization: `Bearer ${mine}` },
    });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      sessions: [{ id, label: "billing", grant: "device", client_id: "curl" }],
    });

    const theirs = await selfSignedBearer(STRANGER);
    expect(
      (
        await fetch(`${url}/oauth/sessions/${id}/withdraw`, {
          method: "POST",
          headers: { authorization: `Bearer ${theirs}` },
        })
      ).status,
    ).toBe(404);
    // Not with a host session token, nor anonymously.
    for (const authorization of [
      `Bearer ${body.access_token as string}`,
      undefined,
    ]) {
      const response = await fetch(`${url}/oauth/sessions`, {
        headers: authorization ? { authorization } : {},
      });
      expect(response.status).toBe(401);
    }
    const out = await fetch(`${url}/oauth/sessions/${id}/withdraw`, {
      method: "POST",
      headers: { authorization: `Bearer ${mine}` },
    });
    expect(out.status).toBe(200);
    expect((await sessions.verify(body.access_token as string)).ok).toBe(false);
  });
});

describe("limits", () => {
  // A fresh X-Forwarded-For per request, as a script escaping limits sends.
  let forged = 0;
  const forgedFor = () => ({
    "x-forwarded-for": `198.51.100.${++forged % 250}`,
  });

  it("lets one address start 10 grants a minute, whatever X-Forwarded-For says", async () => {
    // No proxy is trusted here: the header names nobody, and the request is
    // still made over loopback, so the issuer holds too.
    remount({ publicOrigin: url });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push(
        (
          await form(
            "/oauth/device_authorization",
            { client_id: "c" },
            forgedFor(),
          )
        ).status,
      );
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    // The "From" the consent page shows is the socket's.
    const grants = listDeviceGrants(dataDir);
    expect(new Set(grants.map((g) => g.requestedFrom))).toEqual(
      new Set(["127.0.0.1"]),
    );
  });

  it("lets one address miss a code 10 times a minute, whatever X-Forwarded-For says", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push(
        (
          await fetch(`${url}/oauth/device/pending?user_code=BBBB-BBBB`, {
            headers: forgedFor(),
          })
        ).status,
      );
    }
    // A forwarded request names no issuer here, which answers first.
    expect(statuses.slice(0, 10).every((s) => s === 503)).toBe(true);
    remount({ publicOrigin: url });
    const counted: number[] = [];
    for (let i = 0; i < 11; i++) {
      counted.push(
        (
          await fetch(`${url}/oauth/device/pending?user_code=BBBB-BBBB`, {
            headers: forgedFor(),
          })
        ).status,
      );
    }
    expect(counted.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(counted[10]).toBe(429);
  });

  it("behind a trusted proxy, charges the right-most hop that is not the proxy's own", async () => {
    remount({ publicOrigin: url, trustProxy: true });
    const start = (forwardedFor: string) =>
      form(
        "/oauth/device_authorization",
        { client_id: "c" },
        { "x-forwarded-for": forwardedFor },
      );
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      // The caller writes what is left of its own address; the proxies
      // append theirs (private addresses) after it.
      statuses.push(
        (await start(`198.51.100.${i}, 203.0.113.7, 10.0.0.4`)).status,
      );
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect((await start("203.0.113.8, 10.0.0.4")).status).toBe(200);
    expect(
      listDeviceGrants(dataDir).filter(
        (g) => g.requestedFrom === "203.0.113.7",
      ),
    ).toHaveLength(10);
  });

  it("holds at most 20 pending grants per address", async () => {
    remount({ publicOrigin: url });
    clock = Date.now();
    const statuses: number[] = [];
    for (let minute = 0; minute < 3; minute++) {
      for (let i = 0; i < 10; i++) {
        statuses.push(
          (await form("/oauth/device_authorization", { client_id: "c" }))
            .status,
        );
      }
      clock += 61_000;
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});

describe("a session nobody collected", () => {
  it("is withdrawn when its code expires, and counts for nobody", async () => {
    const started = await start();
    expect((await approve(started)).status).toBe(200);
    const pending = listDeviceGrants(dataDir)[0]!;
    clock = Date.now() + 11 * 60_000;
    expect((await poll(started)).body.error).toBe("expired_token");
    expect(readHostSession({ dataDir, id: pending.sessionId })).toBeUndefined();
    expect(
      readCredentialWithdrawal({
        dataDir,
        id: credentialRecordId({
          address: PERSON.address,
          chainId: 1,
          sessionDid: pending.sessionDid,
        }),
      })?.by,
    ).toBe("host");
    expect(withdrawn).toEqual([pending.sessionDid]);
  });

  it("is not listed once withdrawn by `ph credentials withdraw`", async () => {
    const started = await start();
    await approve(started);
    const { body } = await poll(started);
    const session = readHostSession({
      dataDir,
      id: body.ph_session as string,
    })!;
    withdrawCredentialRecords({
      dataDir,
      ids: [
        credentialRecordId({
          address: PERSON.address,
          chainId: 1,
          sessionDid: session.did,
        }),
      ],
      by: "command",
    });
    const key = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    writeCredentialRecord({
      dataDir,
      credential: await credentialFor(PERSON, key.did, { label: "ph-cli" }),
      source: "cli",
    });
    const listed = await fetch(`${url}/oauth/sessions`, {
      headers: {
        authorization: `Bearer ${await key.getBearerToken(PERSON.address, { expiresIn: 60 })}`,
      },
    });
    expect(await listed.json()).toEqual({ sessions: [] });
  });
});

describe("an approval racing the person", () => {
  it("loses to a Deny that lands while its credential is checked", async () => {
    let entered!: () => void;
    const checking = new Promise<void>((resolve) => (entered = resolve));
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const { checkCredentialFor } = await import("@renown/sdk/node");
    remount({
      checkCredential: async (...args) => {
        entered();
        await held;
        return checkCredentialFor(...args);
      },
    });
    const started = await start();
    const pending = await pendingOf(started.user_code);
    const approving = approve(started);
    // The approval waits in its check; the person denies meanwhile.
    await checking;
    const denied = await post("/oauth/device/deny", {
      user_code: started.user_code,
      nonce: pending.nonce,
    });
    expect(denied.status).toBe(200);
    release();
    const response = await approving;
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_grant" });
    expect((await poll(started)).body.error).toBe("access_denied");
  });
});

describe("the Renown button", () => {
  const press = (started: Started, nonce: string, headers = {}) =>
    fetchOriginal(`${url}/oauth/device/renown`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...headers,
      },
      body: new URLSearchParams({
        user_code: started.user_code,
        nonce,
      }).toString(),
    });

  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const target = String(input instanceof Request ? input.url : input);
      return target.startsWith("https://renown.test")
        ? Promise.resolve(Response.json({ status: "pending" }))
        : fetchOriginal(input, init);
    });
  });

  it("needs this host's Origin: a client sending none is refused", async () => {
    const started = await start();
    const { nonce } = await pendingOf(started.user_code);
    expect((await press(started, nonce)).status).toBe(403);
    expect((await press(started, nonce, { origin: "null" })).status).toBe(403);
    expect((await press(started, nonce, { origin: issuer })).status).toBe(303);
    // A browser's same-origin post under a policy that hides the origin.
    expect(
      (
        await press(started, nonce, {
          origin: "null",
          "sec-fetch-site": "same-origin",
        })
      ).status,
    ).toBe(303);
  });

  it("starts at most 3 polls per address", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const started = await start();
      const { nonce } = await pendingOf(started.user_code);
      statuses.push((await press(started, nonce, { origin: issuer })).status);
    }
    expect(statuses).toEqual([303, 303, 303, 429]);
  });
});

describe("a host where a session could do nothing", () => {
  it("refuses a grant, saying why", async () => {
    remount({ sessionsUseless: () => "Nothing to do here: ADMIN_ONLY." });
    const response = await form("/oauth/device_authorization", {
      client_id: "c",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_scope",
      error_description: "Nothing to do here: ADMIN_ONLY.",
    });
    expect(listDeviceGrants(dataDir)).toEqual([]);
  });
});

describe("a request through a proxy on this computer", () => {
  it("names no issuer without PUBLIC_URL, and says to set it", async () => {
    const headers = { "x-forwarded-proto": "https" };
    const metadata = await fetch(
      `${url}/.well-known/oauth-authorization-server`,
      { headers },
    );
    expect(metadata.status).toBe(404);
    expect(
      ((await metadata.json()) as { error_description: string })
        .error_description,
    ).toContain("PUBLIC_URL");
    const started = await form(
      "/oauth/device_authorization",
      { client_id: "c" },
      { forwarded: "for=203.0.113.7" },
    );
    expect(started.status).toBe(503);
    expect(
      ((await started.json()) as { error_description: string })
        .error_description,
    ).toMatch(/proxy.*PUBLIC_URL/);
  });
});
