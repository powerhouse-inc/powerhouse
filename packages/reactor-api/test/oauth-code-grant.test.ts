// The authorization code grant for MCP clients (F3e part 2, Q1): dynamic
// registration of public clients, `authorize` on the device grant's object
// and consent, the code's token request with PKCE, and the refusals. A real
// route service over Express, real files in a temp data folder, Renown out of
// reach.
import {
  credentialRecordId,
  readCredentialWithdrawal,
} from "@powerhousedao/shared/clis/credential-records";
import { readHostSession } from "@powerhousedao/shared/clis/host-sessions";
import {
  buildAndSignCredential,
  createCredentialVerifier,
  type CredentialVerifier,
} from "@renown/sdk/node";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import type { Server } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExpressHttpAdapter } from "../src/graphql/gateway/adapter-http-express.js";
import { HttpRouteService } from "../src/http/index.js";
import {
  listOAuthClients,
  newOAuthClient,
  readOAuthClient,
} from "../src/http/oauth-clients.js";
import {
  grantIdOf,
  listDeviceGrants,
  readDeviceGrant,
} from "../src/http/oauth-grants.js";
import { mountOAuthMetadata } from "../src/http/oauth-metadata.js";
import {
  mountOAuthRoutes,
  type OAuthRoutesOptions,
} from "../src/http/oauth-routes.js";
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

// A well-known Anvil dev key; never used for anything real.
const PERSON = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const REDIRECT = "http://127.0.0.1:65001/callback";

let dataDir: string;
let verifier: CredentialVerifier;
let sessions: HostSessions;
let server: Server;
let url: string;
let routes: HttpRouteService;
let disposeRoutes: () => void;
let clock: number | undefined;

const now = () => clock ?? Date.now();

function remount(extra: Partial<OAuthRoutesOptions> = {}) {
  disposeRoutes();
  const mounted = mountOAuthRoutes(routes.hostScope("oauth", "/oauth"), {
    dataDir,
    publicOrigin: undefined,
    basePath: "/",
    renownUrl: "https://renown.test",
    hostDid: () => "did:key:zHostKey",
    onWithdrawn: () => undefined,
    now,
    ...extra,
  });
  disposeRoutes = () => mounted.dispose();
}

beforeEach(async () => {
  clock = undefined;
  dataDir = mkdtempSync(join(tmpdir(), "oauth-code-"));
  verifier = createCredentialVerifier({ dataDir, watch: false });
  sessions = new HostSessions({ dataDir, verifier, watch: false });
  const adapter = new ExpressHttpAdapter();
  adapter.setupMiddleware({});
  server = await adapter.listen(0, undefined, "127.0.0.1");
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  routes = new HttpRouteService({ httpAdapter: adapter });
  disposeRoutes = () => undefined;
  remount();
  mountOAuthMetadata(adapter, { publicOrigin: undefined, basePath: "/" });
});

afterEach(async () => {
  disposeRoutes();
  sessions.close();
  verifier.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

function register(metadata: Record<string, unknown>) {
  return fetch(`${url}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(metadata),
  });
}

async function client(name = "Claude Code"): Promise<string> {
  const response = await register({
    client_name: name,
    redirect_uris: [REDIRECT],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
  expect(response.status, await response.clone().text()).toBe(201);
  return ((await response.json()) as { client_id: string }).client_id;
}

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}

function authorizeUrl(params: Record<string, string | undefined>) {
  const target = new URL(`${url}/oauth/authorize`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) target.searchParams.set(name, value);
  }
  return target.href;
}

const open = (target: string) => fetch(target, { redirect: "manual" });

/** The answer a refused request takes back to the client. */
async function sentBack(target: string) {
  const response = await open(target);
  expect(response.status, await response.clone().text()).toBe(302);
  const location = new URL(response.headers.get("location")!);
  expect(location.origin + location.pathname).toBe(REDIRECT);
  return Object.fromEntries(location.searchParams);
}

/** Signs in to the consent page: the user code and the page's continue link. */
async function consent(target: string) {
  const response = await open(target);
  expect(response.status, await response.clone().text()).toBe(200);
  const page = await response.text();
  const code = /ph token approve ([A-Z]{4}-[A-Z]{4})/.exec(page)![1];
  const next = /<a href="([^"]+)">continue<\/a>/
    .exec(page)![1]
    .replaceAll("&amp;", "&");
  return { page, code, next, headers: response.headers };
}

/** An authorize request of `clientId` with PKCE, `extra` over it. */
function authorizeOf(
  clientId: string,
  extra: Record<string, string | undefined> = {},
) {
  return authorizeUrl({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: pkce().challenge,
    code_challenge_method: "S256",
    ...extra,
  });
}

/** Approves the code as PERSON, as `ph token approve` does. */
async function approveAs(code: string) {
  const pending = (await (
    await fetch(`${url}/oauth/device/pending?user_code=${code}`)
  ).json()) as { session_did: string; nonce: string; label: string };
  const credential = await buildAndSignCredential({
    signTypedData: (args) => PERSON.signTypedData(args),
    address: PERSON.address,
    chainId: 1,
    app: pending.label,
    appId: pending.session_did,
    expiresInDays: 30,
  });
  const response = await fetch(`${url}/oauth/device/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_code: code,
      credential,
      nonce: pending.nonce,
    }),
  });
  expect(response.status, await response.clone().text()).toBe(200);
}

function exchange(fields: Record<string, string | undefined>) {
  const body = new URLSearchParams();
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined) body.set(name, value);
  }
  return fetch(`${url}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

/** A client, signed in and approved: the code its redirect received. */
async function approvedCode(o: { resource?: string } = {}) {
  const clientId = await client();
  const { verifier: codeVerifier, challenge } = pkce();
  const { code: userCode, next } = await consent(
    authorizeUrl({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "xyz",
      scope: "documents:write",
      resource: o.resource ?? `${url}/mcp`,
    }),
  );
  await approveAs(userCode);
  const back = await sentBack(next);
  return { clientId, codeVerifier, code: back.code!, back };
}

describe("discovery", () => {
  it("lists the authorization code grant, PKCE S256 and registration", async () => {
    const metadata = (await (
      await fetch(`${url}/.well-known/oauth-authorization-server`)
    ).json()) as Record<string, unknown>;
    expect(metadata).toMatchObject({
      issuer: url,
      authorization_endpoint: `${url}/oauth/authorize`,
      registration_endpoint: `${url}/oauth/register`,
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
      authorization_response_iss_parameter_supported: true,
      token_endpoint_auth_methods_supported: ["none"],
    });
    expect(metadata.grant_types_supported).toEqual([
      "urn:ietf:params:oauth:grant-type:device_code",
      "authorization_code",
    ]);
  });
});

describe("registration", () => {
  it("registers a public client with its redirect URIs, for the code grant only", async () => {
    const response = await register({
      client_name: "Claude Code",
      redirect_uris: [REDIRECT, "https://app.example/cb"],
      grant_types: ["authorization_code", "refresh_token"],
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      client_id: expect.stringMatching(/^phc_[0-9a-f]{32}$/) as unknown,
      client_name: "Claude Code",
      redirect_uris: [REDIRECT, "https://app.example/cb"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    });
  });

  it("takes https, http on loopback, or an app's own scheme, and nothing else", async () => {
    clock = Date.now();
    for (const uri of [
      "http://app.example/cb",
      "javascript:alert(1)",
      "data:text/html,<p>x</p>",
      "file:///etc/passwd",
      "vbscript:msgbox",
      "blob:https://app.example/1",
      "about:blank",
      "ws://127.0.0.1:3000/cb",
      "wss://app.example/cb",
      "ftp://app.example/cb",
      "https://app.example/cb#frag",
      "https://user:pass@app.example/cb",
      "cursor://user:pass@callback",
      "not a url",
    ]) {
      const response = await register({ redirect_uris: [uri] });
      expect(response.status, uri).toBe(400);
      expect(((await response.json()) as { error: string }).error).toBe(
        "invalid_redirect_uri",
      );
      // Under the ten registrations a minute one address may make.
      clock += 7_000;
    }
    for (const uri of [
      "http://localhost:3000/cb",
      "http://[::1]:3000/cb",
      "https://app.example/cb",
      // RFC 8252 7.1: an app's own scheme, an editor's, say.
      "cursor://anysphere.cursor-mcp/oauth/callback",
      "com.example.app:/oauth2redirect",
    ]) {
      expect((await register({ redirect_uris: [uri] })).status, uri).toBe(201);
      clock += 7_000;
    }
    expect((await register({})).status).toBe(400);
  });

  it("drops a client no grant was approved for after an hour, and keeps one in use", async () => {
    clock = Date.now();
    const unused = await client("Unused");
    const used = await client("Used");
    const { code } = await consent(authorizeOf(used));
    await approveAs(code);
    clock += 61 * 60_000;
    expect(readOAuthClient(dataDir, unused, now())).toBeUndefined();
    expect(readOAuthClient(dataDir, used, now())).toMatchObject({
      clientName: "Used",
      approvedAt: expect.any(String) as unknown,
    });
    const refused = await open(authorizeOf(unused));
    expect(refused.status).toBe(400);
    expect(await refused.text()).toContain("not registered here");
    expect((await open(authorizeOf(used))).status).toBe(200);
  });

  it("in a full table, makes room by dropping the oldest client nobody approved a grant for", async () => {
    // 1,000 held (written as files: registering them would take an hour of
    // rate limits). The oldest is in use; the next oldest is not.
    const dir = join(dataDir, ".ph", "oauth", "clients");
    mkdirSync(dir, { recursive: true });
    const base = Date.now() - 30 * 60_000;
    const filled = Array.from({ length: 1000 }, (_, i) => {
      const held = newOAuthClient({
        redirectUris: [REDIRECT],
        registeredFrom: "203.0.113.9",
        now: base + i,
      });
      const client =
        i === 0
          ? {
              ...held,
              approvedAt: new Date(base).toISOString(),
              expiresAt: new Date(base + 30 * 86_400_000).toISOString(),
            }
          : held;
      writeFileSync(
        join(dir, `${client.clientId}.json`),
        JSON.stringify(client),
      );
      return client;
    });
    const fresh = await client("Fresh");
    expect(readOAuthClient(dataDir, fresh, now())).toBeDefined();
    expect(existsSync(join(dir, `${filled[0]!.clientId}.json`))).toBe(true);
    expect(existsSync(join(dir, `${filled[1]!.clientId}.json`))).toBe(false);
    expect(listOAuthClients(dataDir, now())).toHaveLength(1000);
  });

  it("refuses a confidential client, and a client of another grant", async () => {
    for (const metadata of [
      { token_endpoint_auth_method: "client_secret_basic" },
      { grant_types: ["client_credentials"] },
      { response_types: ["token"] },
    ]) {
      const response = await register({
        redirect_uris: [REDIRECT],
        ...metadata,
      });
      expect(response.status).toBe(400);
      expect(((await response.json()) as { error: string }).error).toBe(
        "invalid_client_metadata",
      );
    }
  });

  it("registers at most 10 a minute and 20 held per address", async () => {
    clock = Date.now();
    const statuses: number[] = [];
    for (let minute = 0; minute < 3; minute++) {
      for (let i = 0; i < 11; i++) {
        statuses.push((await register({ redirect_uris: [REDIRECT] })).status);
      }
      clock += 61_000;
    }
    // A minute's eleventh is refused; past 20 held, every one is.
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(statuses.slice(11, 21).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(22).every((s) => s === 429)).toBe(true);
  });
});

describe("authorize", () => {
  it("shows the consent page with where the browser returns, and approves nothing by being opened", async () => {
    const clientId = await client();
    const { challenge } = pkce();
    const { page, headers } = await consent(
      authorizeUrl({
        response_type: "code",
        client_id: clientId,
        redirect_uri: REDIRECT,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "s1",
      }),
    );
    // Deny answers with a redirect to the client, which `form-action`
    // checks too: the redirect URI's origin may be reached from this page.
    expect(headers.get("content-security-policy")).toContain(
      "form-action 'self' https://renown.test http://127.0.0.1:65001;",
    );
    expect(headers.get("referrer-policy")).toBe("same-origin");
    for (const shown of [
      "Claude Code",
      "Returns to",
      "127.0.0.1:65001",
      "may sign document changes as you on this host; no administration",
      `--url ${url}`,
      'http-equiv="refresh"',
    ]) {
      expect(page, shown).toContain(shown);
    }
    const [grant] = listDeviceGrants(dataDir);
    expect(grant).toMatchObject({
      status: "pending",
      label: "Claude Code",
      code: { clientId, redirectUri: REDIRECT, state: "s1" },
    });
  });

  it("answers an unknown client and a redirect it did not register here, sending nothing", async () => {
    const clientId = await client();
    const { challenge } = pkce();
    for (const params of [
      { client_id: "phc_" + "0".repeat(32), redirect_uri: REDIRECT },
      { client_id: clientId, redirect_uri: "http://127.0.0.1:65001/other" },
    ]) {
      const response = await open(
        authorizeUrl({
          response_type: "code",
          code_challenge: challenge,
          code_challenge_method: "S256",
          ...params,
        }),
      );
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("sends a request without PKCE, with plain, for another resource or scope back with the error, the state and the issuer", async () => {
    const clientId = await client();
    const { challenge } = pkce();
    const base = {
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT,
      state: "st",
      code_challenge: challenge,
      code_challenge_method: "S256",
    };
    for (const [params, error] of [
      [{ code_challenge: undefined }, "invalid_request"],
      [{ code_challenge_method: "plain" }, "invalid_request"],
      [{ code_challenge_method: undefined }, "invalid_request"],
      [{ resource: "https://elsewhere.example/mcp" }, "invalid_target"],
      [{ scope: "documents:read" }, "invalid_scope"],
      [{ response_type: "token" }, "unsupported_response_type"],
    ] as const) {
      expect(
        await sentBack(authorizeUrl({ ...base, ...params })),
        JSON.stringify(params),
      ).toMatchObject({ error, state: "st", iss: url });
    }
    expect(listDeviceGrants(dataDir)).toEqual([]);
  });

  it("answers a refusal for a redirect URI off loopback with a page here, before the person acts, sending nothing", async () => {
    const registered = await register({
      client_name: "Web app",
      redirect_uris: ["https://app.example/cb"],
    });
    const clientId = ((await registered.json()) as { client_id: string })
      .client_id;
    const base = {
      response_type: "code",
      client_id: clientId,
      redirect_uri: "https://app.example/cb",
      state: "st",
      code_challenge: pkce().challenge,
      code_challenge_method: "S256",
    };
    for (const [params, error] of [
      [{ code_challenge: undefined }, "invalid_request"],
      [{ resource: "https://elsewhere.example/mcp" }, "invalid_target"],
      [{ scope: "documents:read" }, "invalid_scope"],
      [{ response_type: "token" }, "unsupported_response_type"],
    ] as const) {
      const response = await open(authorizeUrl({ ...base, ...params }));
      expect(response.status, JSON.stringify(params)).toBe(400);
      expect(response.headers.get("location")).toBeNull();
      const page = await response.text();
      expect(page).toContain("Cannot sign in");
      expect(page).toContain(error);
      expect(page).not.toContain("app.example");
    }
    // The consent page itself, and its Deny, still go back there.
    const { page, code } = await consent(authorizeUrl(base));
    const nonce = /name="nonce" value="([^"]+)"/.exec(page)![1];
    const denied = await fetch(`${url}/oauth/device/deny`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ user_code: code, nonce }).toString(),
    });
    expect(denied.status).toBe(302);
    expect(denied.headers.get("location")).toMatch(
      /^https:\/\/app\.example\/cb\?error=access_denied&/,
    );
  });

  it("is rate limited before any work, whatever it asks", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push(
        (await open(authorizeOf("phc_" + "0".repeat(32), { state: "x" })))
          .status,
      );
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
    // A registered client from that address waits too.
    const clientId = await client();
    const limited = await open(authorizeOf(clientId));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("location")).toBeNull();
    expect(listDeviceGrants(dataDir)).toEqual([]);
  });

  it("takes a loopback redirect URI at any port, and only its own host and path", async () => {
    const clientId = await client();
    const { verifier: codeVerifier, challenge } = pkce();
    const atPort = "http://127.0.0.1:50123/callback";
    const {
      code: userCode,
      next,
      headers,
    } = await consent(
      authorizeOf(clientId, {
        redirect_uri: atPort,
        code_challenge: challenge,
      }),
    );
    expect(headers.get("content-security-policy")).toContain(
      "http://127.0.0.1:50123;",
    );
    await approveAs(userCode);
    const response = await open(next);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(atPort);
    // The token request names the port the code went to.
    const issued = await exchange({
      grant_type: "authorization_code",
      code: location.searchParams.get("code")!,
      client_id: clientId,
      redirect_uri: atPort,
      code_verifier: codeVerifier,
    });
    expect(issued.status, await issued.clone().text()).toBe(200);
    for (const other of [
      "http://127.0.0.1:50123/other",
      "http://localhost:50123/callback",
      "http://127.0.0.1:50123/callback?x=1",
    ]) {
      const refused = await open(
        authorizeOf(clientId, { redirect_uri: other }),
      );
      expect(refused.status, other).toBe(400);
      expect(refused.headers.get("location")).toBeNull();
    }
  });

  it("takes an https redirect URI at its own port only", async () => {
    const registered = await register({
      redirect_uris: ["https://app.example/cb"],
    });
    const clientId = ((await registered.json()) as { client_id: string })
      .client_id;
    const refused = await open(
      authorizeOf(clientId, { redirect_uri: "https://app.example:8443/cb" }),
    );
    expect(refused.status).toBe(400);
  });

  it("shows an app's own scheme and its target in full, and lets its Deny reach it", async () => {
    const target = "cursor://anysphere.cursor-mcp/oauth/callback";
    const registered = await register({
      client_name: "Cursor",
      redirect_uris: [target],
    });
    const clientId = ((await registered.json()) as { client_id: string })
      .client_id;
    const { page, code, headers } = await consent(
      authorizeOf(clientId, { redirect_uri: target, state: "c1" }),
    );
    expect(page).toContain(`<dd>${target}</dd>`);
    expect(headers.get("content-security-policy")).toContain(
      "form-action 'self' https://renown.test cursor:;",
    );
    const pending = (await (
      await fetch(`${url}/oauth/device/pending?user_code=${code}`)
    ).json()) as { returns_to: string };
    expect(pending.returns_to).toBe(target);
    // Not loopback: a refusal before the person acts is a page here.
    const refused = await open(
      authorizeOf(clientId, { redirect_uri: target, scope: "documents:read" }),
    );
    expect(refused.status).toBe(400);
    expect(refused.headers.get("location")).toBeNull();
  });

  it("counts a plain GET toward its app's cap of waiting sign-ins before it makes a grant", async () => {
    clock = Date.now();
    const clientId = await client();
    for (let i = 0; i < 10; i++) {
      expect((await open(authorizeOf(clientId))).status).toBe(200);
      // Under the ten sign-ins a minute one address may start.
      clock += 7_000;
    }
    // The eleventh is turned back (its redirect URI is loopback) and makes none.
    expect(await sentBack(authorizeOf(clientId, { state: "s" }))).toMatchObject(
      {
        error: "temporarily_unavailable",
        state: "s",
      },
    );
    expect(
      listDeviceGrants(dataDir).filter(
        (grant) => grant.code?.clientId === clientId,
      ),
    ).toHaveLength(10);
  });

  it("is refused where a session could do nothing", async () => {
    remount({ sessionsUseless: () => "ADMIN_ONLY here." });
    const clientId = await client();
    expect(
      await sentBack(
        authorizeUrl({
          response_type: "code",
          client_id: clientId,
          redirect_uri: REDIRECT,
          code_challenge: pkce().challenge,
          code_challenge_method: "S256",
        }),
      ),
    ).toMatchObject({
      error: "access_denied",
      error_description: "ADMIN_ONLY here.",
    });
  });
});

describe("the code", () => {
  it("goes back once approved, with the state and the issuer, and is exchanged once for a token of the session", async () => {
    const { clientId, codeVerifier, code, back } = await approvedCode();
    expect(back).toMatchObject({ state: "xyz", iss: url });
    const issued = await exchange({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_verifier: codeVerifier,
      resource: `${url}/mcp`,
    });
    expect(issued.status, await issued.clone().text()).toBe(200);
    expect(issued.headers.get("cache-control")).toBe("no-store");
    const body = (await issued.json()) as {
      access_token: string;
      ph_session: string;
    };
    expect(await sessions.verify(body.access_token)).toMatchObject({
      ok: true,
      user: {
        address: PERSON.address,
        label: "Claude Code",
        hostSession: { grant: "code" },
      },
    });
    expect(readHostSession({ dataDir, id: body.ph_session })?.clientId).toBe(
      clientId,
    );
    // Replayed: no second token.
    const replayed = await exchange({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_verifier: codeVerifier,
    });
    expect(replayed.status).toBe(400);
    expect(((await replayed.json()) as { error: string }).error).toBe(
      "invalid_grant",
    );
  });

  it("is refused, and spent, for a wrong verifier, redirect, client or resource", async () => {
    for (const [wrong, error] of [
      [
        { code_verifier: randomBytes(32).toString("base64url") },
        "invalid_grant",
      ],
      [{ code_verifier: undefined }, "invalid_grant"],
      [{ redirect_uri: "http://127.0.0.1:65001/other" }, "invalid_grant"],
      [{ client_id: "phc_" + "1".repeat(32) }, "invalid_grant"],
      [{ resource: "https://elsewhere.example/mcp" }, "invalid_target"],
    ] as const) {
      const { clientId, codeVerifier, code } = await approvedCode();
      const grant = readDeviceGrant(dataDir, grantIdOf(code))!;
      const fields = {
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: REDIRECT,
        code_verifier: codeVerifier,
        ...wrong,
      };
      const refused = await exchange(fields);
      expect(refused.status, JSON.stringify(wrong)).toBe(400);
      expect(((await refused.json()) as { error: string }).error).toBe(error);
      // Spent: the right request after it gets nothing.
      const after = await exchange({
        ...fields,
        client_id: clientId,
        redirect_uri: REDIRECT,
        code_verifier: codeVerifier,
        resource: undefined,
      });
      expect(after.status).toBe(400);
      // And its session, approved but never issued a token, is withdrawn.
      expect(readHostSession({ dataDir, id: grant.sessionId })).toBeUndefined();
      expect(
        readCredentialWithdrawal({
          dataDir,
          id: credentialRecordId({
            address: PERSON.address,
            chainId: 1,
            sessionDid: grant.sessionDid,
          }),
        })?.by,
        JSON.stringify(wrong),
      ).toBe("host");
    }
  });

  it("expires a minute after it was issued", async () => {
    const { clientId, codeVerifier, code } = await approvedCode();
    clock = Date.now() + 61_000;
    const late = await exchange({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_verifier: codeVerifier,
    });
    expect(late.status).toBe(400);
    expect(((await late.json()) as { error: string }).error).toBe(
      "invalid_grant",
    );
  });

  it("is no device code", async () => {
    const { clientId, code } = await approvedCode();
    const polled = await exchange({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: code,
      client_id: clientId,
    });
    expect(polled.status).toBe(400);
    expect(((await polled.json()) as { error: string }).error).toBe(
      "invalid_grant",
    );
  });
});

describe("the consent page's checks", () => {
  it("shows the page again until approved, and sends a denial back to the client", async () => {
    const clientId = await client();
    const { code, next, page } = await consent(
      authorizeUrl({
        response_type: "code",
        client_id: clientId,
        redirect_uri: REDIRECT,
        code_challenge: pkce().challenge,
        code_challenge_method: "S256",
        state: "d1",
      }),
    );
    const again = await open(next);
    expect(again.status).toBe(200);
    expect(await again.text()).toContain("Not approved yet");
    const nonce = /name="nonce" value="([^"]+)"/.exec(page)![1];
    const denied = await fetch(`${url}/oauth/device/deny`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ user_code: code, nonce }).toString(),
    });
    expect(denied.status).toBe(302);
    expect(
      Object.fromEntries(new URL(denied.headers.get("location")!).searchParams),
    ).toMatchObject({ error: "access_denied", state: "d1", iss: url });
    expect(listDeviceGrants(dataDir)).toEqual([]);
  });

  it("goes on only with the page's own key", async () => {
    const clientId = await client();
    const { next } = await consent(authorizeOf(clientId));
    const forged = new URL(next);
    forged.searchParams.set("key", randomBytes(32).toString("base64url"));
    expect((await open(forged.href)).status).toBe(403);
    forged.searchParams.delete("key");
    expect((await open(forged.href)).status).toBe(403);
  });

  it("gives whoever holds only the user code no way to take the code", async () => {
    const clientId = await client();
    const { code: userCode, next } = await consent(authorizeOf(clientId));
    const key = new URL(next).searchParams.get("key")!;
    // `device/pending` shows the grant to anyone with the user code: never
    // the page's key, and its nonce opens no continue link.
    const shown = await (
      await fetch(`${url}/oauth/device/pending?user_code=${userCode}`)
    ).text();
    expect(shown).not.toContain(key);
    const { nonce } = JSON.parse(shown) as { nonce: string };
    await approveAs(userCode);
    const continueUrl = `${url}/oauth/authorize/continue`;
    const tries: Record<string, string>[] = [
      { user_code: userCode, nonce },
      { user_code: userCode, key: nonce },
      { user_code: userCode },
    ];
    for (const query of tries) {
      const tried = await open(
        `${continueUrl}?${new URLSearchParams(query).toString()}`,
      );
      expect(tried.status, JSON.stringify(query)).toBe(403);
      expect(tried.headers.get("location")).toBeNull();
    }
    // The page's own link still takes it, once.
    expect((await sentBack(next)).code).toBeDefined();
  });
});
