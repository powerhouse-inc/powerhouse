// The door for host session tokens (F3e part 2): a `phs_` bearer names a
// session the caller delegated to this host. It opens GraphQL, its WebSocket,
// /mcp and attachments only, as the session acting for its user, and never
// as an administrator. Real files in a temp data folder, the real credential
// verifier, Renown out of reach.
import {
  withdrawCredentialRecords,
  writeCredentialRecord,
} from "@powerhousedao/shared/clis/credential-records";
import {
  hostSessionFile,
  mintHostSessionToken,
  newHostSession,
  parseHostSessionToken,
  readHostSession,
  writeHostSession,
  type HostSessionFile,
} from "@powerhousedao/shared/clis/host-sessions";
import {
  buildAndSignCredential,
  createCredentialVerifier,
  type CredentialVerifier,
  type PowerhouseVerifiableCredential,
} from "@renown/sdk/node";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpressHttpAdapter } from "../src/graphql/gateway/adapter-http-express.js";
import { createAuthFetchMiddleware } from "../src/graphql/gateway/auth-middleware.js";
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
    // Its last use is noted.
    expect(
      readHostSession({ dataDir, id: session.id })?.lastUsedAt,
    ).toBeDefined();
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
