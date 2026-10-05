// OAuth2 sign-in end to end: a fixture piece served by a local npm, a real
// provider token endpoint on loopback, and a PGlite-backed secret store.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createHash } from "node:crypto";
import {
  actions,
  reducer,
  utils,
  type ConnectionDocument,
} from "@powerhousedao/workflow/document-models/connection";
import type { Action } from "document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createFreshRelationalDb,
  createTestRelationalDb,
} from "../../test/helpers/pglite.js";
import {
  startPieceSources,
  type PieceSources,
} from "../../test/helpers/piece-sources.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import type { WorkflowRuntimeHostDeps } from "./host.js";
import { resolveConnectionWithSecrets } from "./lib.js";
import {
  OAUTH_TOKEN,
  OAuthAttemptStore,
  postTokenForm,
  StoreTokenRefresher,
  tokenDue,
  type OAuthTokenSet,
} from "./oauth.js";
import type { WorkflowRuntimeService } from "./service.js";

const PIECE = { name: "@activepieces/piece-oauth-app", version: "1.0.0" };
const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;
const REDIRECT =
  "https://switchboard.example/api/@powerhousedao/workflow/oauth/callback";
const EGRESS_ENV = "PH_WORKFLOWS_EGRESS_ALLOW_ADDRESSES";

interface TokenRequest {
  path: string;
  form: Record<string, string>;
  authorization: string | undefined;
}

// A provider token endpoint: codes it issued, and the challenge each carries.
function startProvider() {
  const requests: TokenRequest[] = [];
  const challenges = new Map<string, string>();
  let refreshCount = 0;
  // Holds a "rt-slow" refresh until the test lets it answer.
  let slow: { arrived: () => void; release: Promise<void> } | undefined;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      const form = Object.fromEntries(new URLSearchParams(body));
      requests.push({
        path: req.url ?? "",
        form,
        authorization: req.headers.authorization,
      });
      const reply = (status: number, json: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(json));
      };
      if (form.client_id !== "cid" || form.client_secret !== "app-secret") {
        return reply(401, { error: "invalid_client" });
      }
      if (form.grant_type === "authorization_code") {
        const challenge = challenges.get(form.code);
        const verified =
          challenge ===
          createHash("sha256")
            .update(String(form.code_verifier))
            .digest("base64url");
        if (!verified || form.redirect_uri !== REDIRECT) {
          return reply(400, { error: "invalid_grant" });
        }
        challenges.delete(form.code);
        return reply(200, {
          access_token: "at-1",
          refresh_token: "rt-1",
          token_type: "Bearer",
          expires_in: 3600,
          team: { id: "T1" },
          id_token: "idt-secret-1",
          authed_user: { id: "U1", access_token: "xoxp-user-1" },
        });
      }
      if (
        form.grant_type === "refresh_token" &&
        form.refresh_token === "rt-1"
      ) {
        refreshCount += 1;
        // No refresh_token: the stored one has to be kept.
        return reply(200, {
          access_token: `at-refreshed-${refreshCount}`,
          expires_in: 3600,
        });
      }
      if (
        form.grant_type === "refresh_token" &&
        form.refresh_token === "rt-slow"
      ) {
        const held = slow;
        held?.arrived();
        void (held?.release ?? Promise.resolve()).then(() =>
          reply(200, {
            access_token: "at-from-slow-refresh",
            expires_in: 3600,
          }),
        );
        return;
      }
      reply(400, { error: "unsupported_grant_type" });
    });
  });
  return new Promise<{
    port: number;
    requests: TokenRequest[];
    holdSlowRefresh(): { arrived: Promise<void>; release(): void };
    issue(code: string, authorizationUrl: string): void;
    stop(): Promise<void>;
  }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        requests,
        holdSlowRefresh: () => {
          let arrived!: () => void;
          let release!: () => void;
          const arrival = new Promise<void>((done) => (arrived = done));
          slow = {
            arrived,
            release: new Promise<void>((done) => (release = done)),
          };
          return { arrived: arrival, release };
        },
        issue: (code, authorizationUrl) => {
          const challenge = new URL(authorizationUrl).searchParams.get(
            "code_challenge",
          );
          challenges.set(code, challenge ?? "");
        },
        stop: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

// Documents a runtime reads and writes, reduced for real.
function documentStore() {
  const documents = new Map<string, ConnectionDocument>();
  return {
    documents,
    client: {
      get: (id: string) => {
        const document = documents.get(id);
        return document
          ? Promise.resolve(document)
          : Promise.reject(new Error(`No document ${id}`));
      },
      execute: (id: string, _branch: string, list: Action[]) => {
        let document = documents.get(id)!;
        for (const action of list) {
          document = reducer(document, action as never);
        }
        documents.set(id, document);
        return Promise.resolve(document);
      },
      find: () => Promise.resolve({ results: [] }),
    },
  };
}

describe("OAuth2 sign-in", () => {
  let provider: Awaited<ReturnType<typeof startProvider>>;
  let sources: PieceSources;
  let service: WorkflowRuntimeService;
  let store: ReturnType<typeof documentStore>;
  let clientSecretRef = "";
  const previousEgress = process.env[EGRESS_ENV];

  beforeAll(async () => {
    process.env.PH_WORKFLOWS_SECRETS_MASTER_KEY =
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    process.env[EGRESS_ENV] = "127.0.0.1/32";
    provider = await startProvider();
    sources = await startPieceSources({
      npm: [
        {
          ...PIECE,
          code: `
const app = {
  displayName: "OAuth App Fixture",
  actions: {},
  auth: {
    type: "OAUTH2",
    displayName: "Connection",
    required: true,
    authUrl: "https://provider.example/{subdomain}/authorize",
    tokenUrl: "http://127.0.0.1:${provider.port}/{subdomain}/token",
    scope: ["read", "write"],
    pkce: true,
    extra: { include_granted_scopes: "true" },
    props: {
      subdomain: { type: "SHORT_TEXT", displayName: "Subdomain", required: true },
    },
  },
};
module.exports = { app };
`,
        },
      ],
    });
    store = documentStore();
    service = testRuntime({
      reactorClient: store.client,
      relationalDb: createTestRelationalDb(),
    } as unknown as WorkflowRuntimeHostDeps);
    clientSecretRef = (
      await (await service.secrets()).create({ value: "app-secret" })
    ).ref;
  });

  afterAll(async () => {
    if (previousEgress === undefined) delete process.env[EGRESS_ENV];
    else process.env[EGRESS_ENV] = previousEgress;
    await sources.stop();
    await provider.stop();
  });

  function connection(config: Record<string, unknown>): string {
    let document = utils.createDocument();
    document = reducer(
      document,
      actions.setConnector({
        connectorId: `${PIECE.name}#oauth-app`,
        authType: "OAUTH2",
      }),
    );
    document = reducer(document, actions.setConfig({ config }));
    document = reducer(
      document,
      actions.setSecretRef({
        id: "sr-secret",
        name: "client_secret",
        ref: clientSecretRef,
      }),
    );
    store.documents.set(document.header.id, document);
    return document.header.id;
  }

  async function signIn(connectionId: string) {
    const started = await service.startOAuth(connectionId, CTX, {
      redirectUri: REDIRECT,
    });
    provider.issue("code-1", started.authorizationUrl);
    return {
      started,
      result: await service.completeOAuth({
        state: started.state,
        code: "code-1",
      }),
    };
  }

  it("sends the user to the provider with the app, scopes and a PKCE challenge", async () => {
    const id = connection({ client_id: "cid", subdomain: "acme" });
    const started = await service.startOAuth(id, CTX, {
      redirectUri: REDIRECT,
    });
    const url = new URL(started.authorizationUrl);
    expect(url.origin + url.pathname).toBe(
      "https://provider.example/acme/authorize",
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: "code",
      client_id: "cid",
      redirect_uri: REDIRECT,
      state: started.state,
      scope: "read write",
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    });
    expect(url.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
    await expect(service.oauthAttempt(started.state, CTX)).resolves.toEqual({
      connectionId: id,
      status: "PENDING",
      error: null,
      returnUrl: null,
    });
  });

  it("stores the token, marks the connection OK and shapes it for pieces", async () => {
    const id = connection({ client_id: "cid", subdomain: "acme" });
    const { started, result } = await signIn(id);

    expect(result).toEqual({ ok: true, detail: null, returnUrl: null });
    await expect(
      service.oauthAttempt(started.state, CTX),
    ).resolves.toMatchObject({ status: "OK", error: null });
    const exchange = provider.requests.at(-1)!;
    expect(exchange.path).toBe("/acme/token");
    expect(exchange.form).toMatchObject({
      grant_type: "authorization_code",
      code: "code-1",
    });

    const state = store.documents.get(id)!.state.global;
    expect(state.status).toBe("OK");
    const tokenRef = state.secretRefs.find((ref) => ref.name === OAUTH_TOKEN);
    expect(tokenRef?.ref).toMatch(/^secret:\/\/v1:/);

    const secrets = await service.secrets();
    const resolved = await resolveConnectionWithSecrets(
      store.documents.get(id)!,
      secrets,
      { piecePackage: PIECE.name },
    );
    expect(resolved.auth).toMatchObject({
      type: "OAUTH2",
      client_id: "cid",
      client_secret: "app-secret",
      access_token: "at-1",
      refresh_token: "rt-1",
      expires_in: 3600,
      redirect_url: REDIRECT,
      data: { team: { id: "T1" } },
      props: { subdomain: "acme" },
    });
    // Nested tokens in the provider's response too, never its plain fields.
    expect(resolved.secretValues.sort()).toEqual(
      ["app-secret", "at-1", "idt-secret-1", "rt-1", "xoxp-user-1"].sort(),
    );
  });

  it("uses a state once", async () => {
    const id = connection({ client_id: "cid", subdomain: "acme" });
    const { started } = await signIn(id);
    const before = provider.requests.length;
    await expect(
      service.completeOAuth({ state: started.state, code: "code-1" }),
    ).resolves.toMatchObject({
      ok: false,
      detail: "This sign-in link has expired or was already used",
    });
    expect(provider.requests).toHaveLength(before);
  });

  it("records the provider's refusal on the attempt, not the connection", async () => {
    const id = connection({ client_id: "cid", subdomain: "acme" });
    const started = await service.startOAuth(id, CTX, {
      redirectUri: REDIRECT,
    });
    const result = await service.completeOAuth({
      state: started.state,
      error: "access_denied",
    });
    expect(result.ok).toBe(false);
    await expect(
      service.oauthAttempt(started.state, CTX),
    ).resolves.toMatchObject({
      status: "ERROR",
      error: "The provider refused the sign-in (access_denied)",
    });
    expect(store.documents.get(id)!.state.global.secretRefs).toHaveLength(1);
  });

  it("refuses a token for an app the connection no longer names", async () => {
    const id = connection({ client_id: "cid", subdomain: "acme" });
    const started = await service.startOAuth(id, CTX, {
      redirectUri: REDIRECT,
    });
    await store.client.execute(id, "main", [
      actions.setConfig({ config: { client_id: "other", subdomain: "acme" } }),
    ]);
    await expect(
      service.completeOAuth({ state: started.state, code: "code-1" }),
    ).resolves.toMatchObject({
      ok: false,
      detail: "The connection changed during sign-in; try again",
    });
  });

  it("asks for the app before signing in", async () => {
    const id = connection({ subdomain: "acme" });
    await expect(
      service.startOAuth(id, CTX, { redirectUri: REDIRECT }),
    ).rejects.toThrow("Set the client ID before connecting");
    const noSubdomain = connection({ client_id: "cid" });
    await expect(
      service.startOAuth(noSubdomain, CTX, { redirectUri: REDIRECT }),
    ).rejects.toThrow('Set "subdomain" before connecting');
  });

  it("refreshes a token close to expiry and keeps its refresh token", async () => {
    const id = connection({ client_id: "cid", subdomain: "acme" });
    await signIn(id);
    const document = store.documents.get(id)!;
    const tokenRef = document.state.global.secretRefs.find(
      (ref) => ref.name === OAUTH_TOKEN,
    )!.ref;
    const secrets = await service.secrets();
    const stored = JSON.parse(await secrets.get(tokenRef)) as OAuthTokenSet;
    await secrets.rotate(
      tokenRef,
      JSON.stringify({ ...stored, claimed_at: stored.claimed_at - 3500 }),
    );

    const refresher = new StoreTokenRefresher(() => service.secrets(), {
      allowAddresses: ["127.0.0.1/32"],
    });
    // Concurrent resolutions share one refresh.
    const [first, second] = await Promise.all([
      resolveConnectionWithSecrets(
        document,
        secrets,
        { piecePackage: PIECE.name },
        refresher,
      ),
      resolveConnectionWithSecrets(
        document,
        secrets,
        { piecePackage: PIECE.name },
        refresher,
      ),
    ]);
    expect(first.auth).toMatchObject({ access_token: "at-refreshed-1" });
    expect(second.auth).toMatchObject({ access_token: "at-refreshed-1" });
    const refreshed = JSON.parse(await secrets.get(tokenRef)) as OAuthTokenSet;
    expect(refreshed).toMatchObject({
      access_token: "at-refreshed-1",
      refresh_token: "rt-1",
      data: { team: { id: "T1" } },
    });
  });

  it("drops a refresh that a newer sign-in overtook", async () => {
    const id = connection({ client_id: "cid", subdomain: "acme" });
    await signIn(id);
    const document = store.documents.get(id)!;
    const tokenRef = document.state.global.secretRefs.find(
      (ref) => ref.name === OAUTH_TOKEN,
    )!.ref;
    const secrets = await service.secrets();
    const stored = JSON.parse(await secrets.get(tokenRef)) as OAuthTokenSet;
    await secrets.rotate(
      tokenRef,
      JSON.stringify({
        ...stored,
        refresh_token: "rt-slow",
        claimed_at: stored.claimed_at - 3500,
      }),
    );
    const refresher = new StoreTokenRefresher(() => service.secrets(), {
      allowAddresses: ["127.0.0.1/32"],
    });

    const held = provider.holdSlowRefresh();
    const refreshing = refresher.refreshIfDue({
      config: document.state.global.config as Record<string, unknown>,
      secretRefs: document.state.global.secretRefs,
    });
    await held.arrived;
    // The user reconnects while the refresh is still out.
    const reconnected = { ...stored, access_token: "at-reconnected" };
    await secrets.rotate(tokenRef, JSON.stringify(reconnected));
    held.release();
    await refreshing;

    expect(JSON.parse(await secrets.get(tokenRef))).toMatchObject({
      access_token: "at-reconnected",
    });
  });

  it("keeps a token that still works when its refresh is refused", async () => {
    const id = connection({ client_id: "cid", subdomain: "acme" });
    await signIn(id);
    const document = store.documents.get(id)!;
    const tokenRef = document.state.global.secretRefs.find(
      (ref) => ref.name === OAUTH_TOKEN,
    )!.ref;
    const secrets = await service.secrets();
    const stored = JSON.parse(await secrets.get(tokenRef)) as OAuthTokenSet;
    const refresher = new StoreTokenRefresher(() => service.secrets(), {
      allowAddresses: ["127.0.0.1/32"],
    });
    const resolve = () =>
      resolveConnectionWithSecrets(
        document,
        secrets,
        { piecePackage: PIECE.name },
        refresher,
      );

    // Due, not expired: the provider refuses the refresh token.
    await secrets.rotate(
      tokenRef,
      JSON.stringify({
        ...stored,
        refresh_token: "rt-revoked",
        claimed_at: stored.claimed_at - 3500,
      }),
    );
    await expect(resolve()).resolves.toMatchObject({
      auth: { access_token: "at-1" },
    });

    // Expired: nothing is left to fall back on.
    await secrets.rotate(
      tokenRef,
      JSON.stringify({
        ...stored,
        refresh_token: "rt-revoked",
        claimed_at: stored.claimed_at - 3700,
      }),
    );
    await expect(resolve()).rejects.toThrow(
      "Refreshing the OAuth2 token failed; reconnect",
    );
  });
});

describe("a sign-in that never finishes", () => {
  it("reads as expired once an exchange outlives its window", async () => {
    const db = createFreshRelationalDb();
    const attempts = await OAuthAttemptStore.create(db);
    const { state } = await attempts.start({
      connectionId: "c1",
      method: {
        authUrl: "https://p.example/auth",
        tokenUrl: "https://p.example/token",
        scope: [],
      },
      props: {},
      clientId: "cid",
      clientSecretRef: `secret://v1:${"0".repeat(32)}`,
      redirectUri: REDIRECT,
    });
    await attempts.claim(state);
    await expect(attempts.view(state)).resolves.toMatchObject({
      status: "EXCHANGING",
    });

    // The process that claimed it is gone; its window passes.
    const raw = (await db.createNamespace("oauth")) as never as {
      updateTable(table: string): {
        set(values: object): { execute(): Promise<unknown> };
      };
    };
    const expireAgo = (ms: number) =>
      raw
        .updateTable("oauth_attempt")
        .set({ expires_at: new Date(Date.now() - ms).toISOString() })
        .execute();
    // Claimed just in time, it is still exchanging.
    await expireAgo(1000);
    await expect(attempts.view(state)).resolves.toMatchObject({
      status: "EXCHANGING",
    });
    await expireAgo(3 * 60 * 1000);
    await expect(attempts.view(state)).resolves.toMatchObject({
      status: "ERROR",
      error: "The sign-in expired before it finished",
    });
  });
});

describe("tokenDue", () => {
  const issued = (expires_in: number): OAuthTokenSet => ({
    access_token: "a",
    refresh_token: "r",
    token_type: "Bearer",
    expires_in,
    claimed_at: 1_000_000,
    token_url: "https://p.example/token",
    redirect_url: REDIRECT,
    data: {},
  });

  it("refreshes an hour-long token 15 minutes early", () => {
    expect(tokenDue(issued(3600), 1_000_000 + 2699)).toBe(false);
    expect(tokenDue(issued(3600), 1_000_000 + 2700)).toBe(true);
  });

  it("gives a short-lived token half its lifetime first", () => {
    expect(tokenDue(issued(600), 1_000_000)).toBe(false);
    expect(tokenDue(issued(600), 1_000_000 + 299)).toBe(false);
    expect(tokenDue(issued(600), 1_000_000 + 300)).toBe(true);
  });
});

describe("postTokenForm", () => {
  let provider: Awaited<ReturnType<typeof startProvider>>;
  beforeAll(async () => {
    provider = await startProvider();
  });
  afterAll(() => provider.stop());

  it("refuses private space the operator did not name", async () => {
    const url = `http://127.0.0.1:${provider.port}/acme/token`;
    await expect(postTokenForm(url, {}, {})).rejects.toThrow(
      "is not reachable from here",
    );
    await expect(
      postTokenForm(`http://localhost:${provider.port}/acme/token`, {}, {}),
    ).rejects.toThrow("is not reachable from here");
    expect(provider.requests).toHaveLength(0);
  });

  it("reports the provider's own error", async () => {
    await expect(
      postTokenForm(
        `http://127.0.0.1:${provider.port}/acme/token`,
        { client_id: "wrong" },
        {},
        { allowAddresses: ["127.0.0.1"] },
      ),
    ).rejects.toThrow("Token endpoint refused (invalid_client)");
  });
});
