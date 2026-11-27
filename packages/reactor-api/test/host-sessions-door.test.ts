// The door for host session tokens (F3e part 2): a `phs_` bearer names a
// session the caller delegated to this host. It opens GraphQL, its WebSocket,
// /mcp and attachments only, as the session acting for its user, and never
// as an administrator. Real files in a temp data folder, the real credential
// verifier, Renown out of reach.
import type {
  IReactorReadClient,
  IReactorWriteClient,
} from "@powerhousedao/reactor";
import {
  readCredentialWithdrawal,
  withdrawCredentialRecords,
  writeCredentialRecord,
} from "@powerhousedao/shared/clis/credential-records";
import {
  hostSessionFile,
  hostSessionUsedFile,
  mintHostSessionToken,
  newHostSession,
  parseHostSessionToken,
  readHostSession,
  readHostSessionLastUsed,
  writeHostSession,
  type HostSessionFile,
} from "@powerhousedao/shared/clis/host-sessions";
import {
  buildAndSignCredential,
  createCredentialVerifier,
  type CredentialVerifier,
  type PowerhouseVerifiableCredential,
} from "@renown/sdk/node";
import { childLogger } from "document-model";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { ExpressHttpAdapter } from "../src/graphql/gateway/adapter-http-express.js";
import { createAuthFetchMiddleware } from "../src/graphql/gateway/auth-middleware.js";
import { asSubscriber } from "../src/graphql/reactor/subgraph.js";
import { RequestClientBinder } from "../src/graphql/request-clients.js";
import { WsCredentialMonitor } from "../src/graphql/ws-credential-monitor.js";
import { HttpRouteService } from "../src/http/index.js";
import { AuthService, type AuthContext } from "../src/services/auth.service.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import {
  currentHostSession,
  runAsCaller,
  type HostSessionUser,
} from "../src/services/host-session-scope.js";
import { HostSessions } from "../src/services/host-sessions.js";
import { OperatorSet } from "../src/services/operator-set.js";

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
const DAY = 24 * 60 * 60 * 1000;

let dataDir: string;
let verifier: CredentialVerifier;
let sessions: HostSessions;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "host-sessions-door-"));
  // Renown is never reached: every ask fails as an outage would.
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
  verifier = createCredentialVerifier({ dataDir });
  sessions = new HostSessions({ dataDir, verifier });
});
afterEach(() => {
  sessions.close();
  verifier.close();
  vi.restoreAllMocks();
  rmSync(dataDir, { recursive: true, force: true });
});

/** A session PERSON approved, its credential's record, and a token of it. */
async function approved(
  o: { label?: string; days?: number; tokenDays?: number } = {},
): Promise<{
  session: HostSessionFile;
  token: string;
  credential: PowerhouseVerifiableCredential;
  recordId: string;
}> {
  const label = o.label ?? "billing";
  const session = newHostSession({ label, clientId: "curl", grant: "device" });
  const credential = await buildAndSignCredential({
    signTypedData: (args) => PERSON.signTypedData(args),
    address: PERSON.address,
    chainId: 1,
    app: label,
    appId: session.did,
    expiresInDays: o.days ?? 30,
  });
  const { token, hash } = mintHostSessionToken(session.id);
  const now = Date.now();
  const kept: HostSessionFile = {
    ...session,
    credential: credential as HostSessionFile["credential"],
    address: PERSON.address,
    chainId: 1,
    approvedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (o.days ?? 30) * DAY).toISOString(),
    tokens: [
      {
        hash,
        expiresAt: new Date(
          now + (o.tokenDays ?? o.days ?? 30) * DAY,
        ).toISOString(),
      },
    ],
  };
  writeHostSession(dataDir, kept);
  const { id } = writeCredentialRecord({
    dataDir,
    credential,
    source: "host-session",
  });
  return { session: kept, token, credential, recordId: id };
}

function door(admins: string[] = []) {
  return new AuthService({
    enabled: true,
    resolveIdentity: true,
    admins,
    credentialVerificationCacheTtlMs: 0,
    verifyCredential: () => Promise.resolve({ ok: false }),
    hostSessions: sessions,
  });
}

async function refusal(result: AuthContext | Response) {
  expect(result).toBeInstanceOf(Response);
  const response = result as Response;
  return {
    status: response.status,
    header: response.headers.get("www-authenticate"),
    body: (await response.json()) as { error: string; reason?: string },
  };
}

describe("a host session token at the door", () => {
  it("names the session acting for its user, with no admins", async () => {
    const { session, token } = await approved();
    const context = await door([PERSON.address.toLowerCase()]).verifyBearer(
      `Bearer ${token}`,
      { hostSessions: true },
    );
    expect(context).toMatchObject({
      admins: [],
      auth_enabled: true,
      user: {
        address: PERSON.address,
        chainId: 1,
        networkId: "eip155",
        appKey: session.did,
        label: "billing",
        via: "host-session",
        hostSession: {
          id: session.id,
          scope: "documents:write",
          grant: "device",
        },
      },
    });
    // Its last use is noted beside it, never by rewriting it.
    expect(readHostSessionLastUsed({ dataDir, id: session.id })).toBeDefined();
  });

  it("notes a use without rewriting the session's own file", async () => {
    const { session, token } = await approved();
    const file = hostSessionFile(dataDir, session.id);
    const before = statSync(file).mtimeMs;
    const text = readFileSync(file, "utf8");
    expect((await sessions.verify(token)).ok).toBe(true);
    expect(statSync(file).mtimeMs).toBe(before);
    expect(readFileSync(file, "utf8")).toBe(text);
    expect(readHostSessionLastUsed({ dataDir, id: session.id })).toBeDefined();
    // Without its note, a session reads as never used, and still opens.
    rmSync(hostSessionUsedFile(dataDir, session.id));
    const fresh = new HostSessions({ dataDir, verifier, watch: false });
    expect((await fresh.verify(token)).ok).toBe(true);
  });

  it("refuses a session Renown approved once Renown withdraws it, and writes the tombstone", async () => {
    const { session, token, credential, recordId } = await approved();
    writeHostSession(dataDir, { ...session, approvedThrough: "renown" });
    let clock = Date.now();
    const atRenown = createCredentialVerifier({
      dataDir,
      answerTtlMs: 0,
      now: () => clock,
    });
    const door = new HostSessions({
      dataDir,
      verifier: atRenown,
      watch: false,
    });
    try {
      vi.mocked(globalThis.fetch).mockImplementation(() =>
        Promise.resolve(Response.json({ credential })),
      );
      expect((await door.verify(token)).ok).toBe(true);
      // Renown serves it no more: withdrawn there, once a second answer a
      // minute later says so too. The session works in between.
      vi.mocked(globalThis.fetch).mockImplementation(() =>
        Promise.resolve(Response.json({}, { status: 404 })),
      );
      expect((await door.verify(token)).ok).toBe(true);
      expect(
        readCredentialWithdrawal({ dataDir, id: recordId }),
      ).toBeUndefined();
      clock += 61_000;
      expect(await door.verify(token)).toEqual({
        ok: false,
        reason: "withdrawn",
      });
      expect(readCredentialWithdrawal({ dataDir, id: recordId })?.by).toBe(
        "renown",
      );
      expect(readHostSession({ dataDir, id: session.id })).toBeUndefined();
    } finally {
      door.close();
      atRenown.close();
    }
  });

  it("asks Renown nothing for a session a pseudonym approved", async () => {
    const { token } = await approved();
    const fetched = vi.mocked(globalThis.fetch);
    fetched.mockClear();
    expect((await sessions.verify(token)).ok).toBe(true);
    expect(fetched).not.toHaveBeenCalled();
  });

  it("is refused where host sessions are not taken", async () => {
    const { token } = await approved();
    const refused = await refusal(await door().verifyBearer(`Bearer ${token}`));
    expect(refused.status).toBe(401);
    expect(refused.body.error).toBe("host-session-not-accepted");
    expect(refused.header).toContain('error="invalid_token"');
    // A host without the door refuses it the same way.
    const without = new AuthService({
      enabled: true,
      admins: [],
      verifyCredential: () => Promise.resolve(true),
    });
    expect(
      (
        await refusal(
          await without.verifyBearer(`Bearer ${token}`, { hostSessions: true }),
        )
      ).body.error,
    ).toBe("host-session-not-accepted");
  });

  it("refuses a token whose secret does not match its session's hash", async () => {
    const { session } = await approved();
    const { token: forged } = mintHostSessionToken(session.id);
    const refused = await refusal(
      await door().verifyBearer(`Bearer ${forged}`, { hostSessions: true }),
    );
    expect(refused).toMatchObject({
      status: 401,
      body: { error: "invalid_token", reason: "unknown" },
    });
    expect(refused.header).toBe('Bearer error="invalid_token"');
  });

  it("refuses an expired token, and a session past its end", async () => {
    const lapsed = await approved({ tokenDays: -1 });
    expect(
      (
        await refusal(
          await door().verifyBearer(`Bearer ${lapsed.token}`, {
            hostSessions: true,
          }),
        )
      ).body.reason,
    ).toBe("expired");

    const ended = await approved();
    writeHostSession(dataDir, {
      ...ended.session,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(
      (
        await refusal(
          await door().verifyBearer(`Bearer ${ended.token}`, {
            hostSessions: true,
          }),
        )
      ).body.reason,
    ).toBe("expired");
  });

  it("refuses a token whose session file is gone", async () => {
    const { session, token } = await approved();
    const service = door();
    expect(
      await service.verifyBearer(`Bearer ${token}`, { hostSessions: true }),
    ).not.toBeInstanceOf(Response);
    rmSync(hostSessionFile(dataDir, session.id));
    expect(
      (
        await refusal(
          await service.verifyBearer(`Bearer ${token}`, { hostSessions: true }),
        )
      ).body.reason,
    ).toBe("withdrawn");
    // A host that never saw it knows no such token.
    const fresh = new HostSessions({ dataDir, verifier, watch: false });
    expect(await fresh.verify(token)).toEqual({ ok: false, reason: "unknown" });
  });

  it("refuses a withdrawn session at the next request, and removes its file", async () => {
    const { session, token, recordId } = await approved();
    const service = door();
    expect(
      await service.verifyBearer(`Bearer ${token}`, { hostSessions: true }),
    ).not.toBeInstanceOf(Response);
    withdrawCredentialRecords({ dataDir, ids: [recordId], by: "command" });
    expect(
      (
        await refusal(
          await service.verifyBearer(`Bearer ${token}`, { hostSessions: true }),
        )
      ).body.reason,
    ).toBe("withdrawn");
    expect(readHostSession({ dataDir, id: session.id })).toBeUndefined();
  });

  it("refuses a session whose credential names another key", async () => {
    const { session, token } = await approved();
    const other = await approved();
    writeHostSession(dataDir, {
      ...session,
      credential: other.session.credential,
    });
    expect(
      (
        await refusal(
          await door().verifyBearer(`Bearer ${token}`, { hostSessions: true }),
        )
      ).body.reason,
    ).toBe("unknown");
  });

  it("refuses anything malformed after the prefix", async () => {
    for (const bad of ["phs_", "phs_nothing", `phs_${"a".repeat(32)}_short`]) {
      expect(
        (
          await refusal(
            await door().verifyBearer(`Bearer ${bad}`, { hostSessions: true }),
          )
        ).body.reason,
      ).toBe("unknown");
    }
  });

  it("opens a WebSocket, and its rechecks fail once the session is withdrawn", async () => {
    const { token, recordId } = await approved();
    const service = door();
    const user = await service.authenticateWebSocketConnection({
      authorization: `Bearer ${token}`,
    });
    expect(user).toMatchObject({ via: "host-session" });
    expect(await service.isCredentialValid(user!)).toBe(true);
    withdrawCredentialRecords({ dataDir, ids: [recordId], by: "command" });
    expect(await service.isCredentialValid(user!)).toBe(false);
    await expect(
      service.authenticateWebSocketConnection({
        authorization: `Bearer ${token}`,
      }),
    ).rejects.toThrow(/withdrawn/);
  });

  it("closes what a removed session file held open", async () => {
    const { session, token } = await approved();
    const claims: string[] = [];
    sessions.onGone((claim) => claims.push(claim.sessionDid));
    expect((await sessions.verify(token)).ok).toBe(true);
    rmSync(hostSessionFile(dataDir, parseHostSessionToken(token)!.id));
    await vi.waitFor(() => expect(claims).toEqual([session.did]), {
      timeout: 5000,
    });
  });

  it("closes a real WebSocket its token opened when the session file goes", async () => {
    const { session, token } = await approved();
    const service = door();
    // As the host wires it: a removed session invalidates its credential,
    // and the monitor closes the sockets it admitted.
    sessions.onGone((claim) =>
      service.invalidateCredential(
        claim.address,
        claim.chainId,
        claim.sessionDid,
      ),
    );
    const monitor = new WsCredentialMonitor({
      authService: service,
      intervalMs: 0,
      logger: childLogger(["test"]),
    });
    monitor.start();
    const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) =>
      wss.once("listening", () => resolve()),
    );
    try {
      wss.on("connection", (socket, request) => {
        void service
          .authenticateWebSocketConnection({
            authorization: request.headers.authorization,
          })
          .then((user) => {
            if (user) monitor.track({ socket }, user);
            socket.send("admitted");
          });
      });
      const { port } = wss.address() as { port: number };
      const client = new WebSocket(`ws://127.0.0.1:${port}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const closed = new Promise<{ code: number; reason: string }>((resolve) =>
        client.on("close", (code, reason) =>
          resolve({ code, reason: reason.toString() }),
        ),
      );
      await new Promise<void>((resolve) =>
        client.once("message", () => resolve()),
      );
      expect(monitor.size).toBe(1);
      rmSync(hostSessionFile(dataDir, session.id));
      expect(await closed).toMatchObject({ code: 4403 });
    } finally {
      monitor.dispose();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    }
  });
});

describe("a host session administers nothing", () => {
  const userOf = async (): Promise<HostSessionUser> => {
    const { token } = await approved();
    const verdict = await sessions.verify(token);
    if (!verdict.ok) throw new Error(verdict.reason);
    return verdict.user;
  };

  it("is no supreme admin or operator for an address in ADMINS, in its scope", async () => {
    const user = await userOf();
    const admins = [PERSON.address.toLowerCase()];
    for (const policy of [
      AuthorizationPolicy.ADMIN_ONLY,
      AuthorizationPolicy.DOCUMENT_PERMISSIONS,
    ]) {
      const service =
        policy === AuthorizationPolicy.ADMIN_ONLY
          ? createAuthorizationService({
              admins,
              defaultProtection: false,
              policy,
            })
          : createAuthorizationService(
              { admins, defaultProtection: false, policy },
              {} as never,
              () => Promise.resolve([]),
            );
      expect(service.isSupremeAdmin(PERSON.address)).toBe(true);
      expect(service.isOperator(PERSON.address)).toBe(true);
      runAsCaller(user, () => {
        expect(currentHostSession()?.hostSession.id).toBe(user.hostSession.id);
        expect(service.isSupremeAdmin(PERSON.address)).toBe(false);
        expect(service.isOperator(PERSON.address)).toBe(false);
      });
    }
  });

  it("is no operator under OPEN either, nor one its launcher named", async () => {
    const user = await userOf();
    const service = createAuthorizationService({
      admins: [],
      defaultProtection: false,
      policy: AuthorizationPolicy.OPEN,
      operators: new OperatorSet({
        admins: [],
        source: { osUser: false, addresses: [PERSON.address.toLowerCase()] },
      }),
    });
    expect(service.isOperator(PERSON.address)).toBe(true);
    runAsCaller(user, () => {
      expect(service.isOperator(PERSON.address)).toBe(false);
      // OPEN's policy-wide access is nobody's administration: it stays.
      expect(service.isSupremeAdmin(PERSON.address)).toBe(true);
    });
  });

  it("runs a WebSocket operation's fields, and its subscription filters, in its scope", async () => {
    const user = await userOf();
    const seen: (string | undefined)[] = [];
    const binder = new RequestClientBinder(
      {} as IReactorReadClient,
      {} as IReactorWriteClient,
    );
    const bound = binder.bindResolvers({
      Subscription: {
        ticks: {
          subscribe: () => {
            seen.push(currentHostSession()?.hostSession.id);
            return { [Symbol.asyncIterator]: () => ({}) };
          },
        },
      },
    }) as {
      Subscription: { ticks: { subscribe: (...args: unknown[]) => unknown } };
    };
    // What the WebSocket server calls, with the context of the connection.
    bound.Subscription.ticks.subscribe(
      undefined,
      {},
      { user },
      {
        operation: { operation: "subscription" },
        parentType: { name: "Subscription" },
        fieldName: "ticks",
      },
    );
    // A filter runs when an event is published, outside any request.
    expect(currentHostSession()).toBeUndefined();
    const filtered = await asSubscriber(() => {
      seen.push(currentHostSession()?.hostSession.id);
      return Promise.resolve(true);
    })({}, {}, { user } as never);
    expect(filtered).toBe(true);
    expect(seen).toEqual([user.hostSession.id, user.hostSession.id]);
  });

  it("runs a GraphQL request in its scope", async () => {
    const { token } = await approved();
    let seen: HostSessionUser | undefined;
    const handler = createAuthFetchMiddleware(door())((request) => {
      void request;
      seen = currentHostSession();
      return Promise.resolve(new Response("ok"));
    });
    const response = await handler(
      new Request("http://host/graphql", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(seen?.via).toBe("host-session");
  });
});

describe("a package route", () => {
  it("refuses a host session token, whatever its auth mode", async () => {
    const { token } = await approved();
    // The requests go to the route below; the session's checks need no Renown.
    vi.restoreAllMocks();
    const adapter = new ExpressHttpAdapter();
    adapter.setupMiddleware({});
    const server = await adapter.listen(0, undefined, "127.0.0.1");
    try {
      const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const routes = new HttpRouteService({
        httpAdapter: adapter,
        authService: door(),
      });
      const scope = routes.scopeFor("pkg");
      scope.get("signed", () => Response.json({ ok: true }));
      scope.get("open", { auth: "public" }, () => Response.json({ ok: true }));
      scope.get("own", { auth: () => ({ authorized: true }) }, () =>
        Response.json({ ok: true }),
      );
      for (const path of ["signed", "open", "own"]) {
        const response = await fetch(`${url}/api/pkg/${path}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        expect(response.status, path).toBe(401);
        expect(((await response.json()) as { error: string }).error).toBe(
          "host-session-not-accepted",
        );
      }
      expect((await fetch(`${url}/api/pkg/open`)).status).toBe(200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
