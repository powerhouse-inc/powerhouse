import express, { type Request, type Response } from "express";
import http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pluginFactory, {
  RenownAuthPlugin,
} from "../src/auth/verdaccio-auth-renown-plugin.js";

const sdkMock = vi.hoisted(() => ({
  verifyAuthBearerToken: vi.fn(),
}));
vi.mock("@renown/sdk/node", () => sdkMock);

interface AnonUser {
  name: undefined;
  groups: string[];
  real_groups: string[];
}
interface AuthUser {
  name: string;
  groups: string[];
  real_groups: string[];
}

interface Helpers {
  createAnonymousRemoteUser: (() => AnonUser) & ReturnType<typeof vi.fn>;
  createRemoteUser: ((name: string, groups: string[]) => AuthUser) &
    ReturnType<typeof vi.fn>;
}

function makeHelpers(): Helpers {
  return {
    createAnonymousRemoteUser: vi.fn(
      (): AnonUser => ({
        name: undefined,
        groups: [],
        real_groups: [],
      }),
    ) as Helpers["createAnonymousRemoteUser"],
    createRemoteUser: vi.fn(
      (name: string, groups: string[]): AuthUser => ({
        name,
        groups,
        real_groups: groups,
      }),
    ) as Helpers["createRemoteUser"],
  };
}

function makePlugin(publicUrl: string) {
  return pluginFactory(
    { publicUrl },
    {
      logger: { debug: vi.fn(), warn: vi.fn() },
    },
  ) as RenownAuthPlugin;
}

interface ListeningServer {
  url: string;
  close(): Promise<void>;
}

async function startApp(
  publicUrl: string,
  helpers: Helpers,
  observe: (req: Request, res: Response) => void,
): Promise<ListeningServer> {
  const app = express();
  const plugin = makePlugin(publicUrl);
  app.use(plugin.apiJWTmiddleware(helpers));
  app.use((req, res) => observe(req, res));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

describe("verdaccio-auth-renown-plugin: apiJWTmiddleware", () => {
  let app: ListeningServer | undefined;

  beforeEach(() => {
    sdkMock.verifyAuthBearerToken.mockReset();
  });
  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  it("sets anonymous when no Authorization header", async () => {
    const helpers = makeHelpers();
    app = await startApp("http://localhost:8765", helpers, (req, res) => {
      res.json((req as unknown as { remote_user: unknown }).remote_user);
    });
    const res = await fetch(`${app.url}/anything`);
    expect(await res.json()).not.toHaveProperty("name");
    expect(helpers.createAnonymousRemoteUser).toHaveBeenCalledTimes(1);
    expect(helpers.createRemoteUser).not.toHaveBeenCalled();
    expect(sdkMock.verifyAuthBearerToken).not.toHaveBeenCalled();
  });

  it("falls through to anonymous for non-Bearer auth", async () => {
    const helpers = makeHelpers();
    app = await startApp("http://localhost:8765", helpers, (req, res) => {
      res.json((req as unknown as { remote_user: unknown }).remote_user);
    });
    const res = await fetch(`${app.url}/x`, {
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(await res.json()).not.toHaveProperty("name");
    expect(sdkMock.verifyAuthBearerToken).not.toHaveBeenCalled();
  });

  it("skips the SDK for non-renown JWT algorithms (RS256)", async () => {
    // header.alg=RS256, payload {}, sig empty — the only thing that matters
    // is the alg field for our peek.
    const headerB64 = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT" }),
    ).toString("base64url");
    const payloadB64 = Buffer.from("{}").toString("base64url");
    const token = `${headerB64}.${payloadB64}.sig`;

    const helpers = makeHelpers();
    app = await startApp("http://localhost:8765", helpers, (req, res) => {
      res.json((req as unknown as { remote_user: unknown }).remote_user);
    });
    const res = await fetch(`${app.url}/x`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(await res.json()).not.toHaveProperty("name");
    expect(sdkMock.verifyAuthBearerToken).not.toHaveBeenCalled();
  });

  it("sets remote user from a verified Renown JWT", async () => {
    sdkMock.verifyAuthBearerToken.mockResolvedValueOnce({
      payload: { aud: "http://localhost:8765", iss: "did:key:z6Mk..." },
      verifiableCredential: {
        credentialSubject: {
          address: "0xABCDEF1234567890",
          chainId: 1,
          networkId: "eip155",
        },
      },
    });

    const helpers = makeHelpers();
    app = await startApp("http://localhost:8765", helpers, (req, res) => {
      res.json((req as unknown as { remote_user: unknown }).remote_user);
    });
    // header.alg=ES256 so peekAlg passes
    const headerB64 = Buffer.from(
      JSON.stringify({ alg: "ES256", typ: "JWT" }),
    ).toString("base64url");
    const token = `${headerB64}.eyJhIjoiYiJ9.sig`;

    const res = await fetch(`${app.url}/-/whoami`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as { name: string; groups: string[] };
    expect(body.name).toBe("0xabcdef1234567890");
    expect(body.groups).toEqual(["$authenticated", "renown"]);
    expect(sdkMock.verifyAuthBearerToken).toHaveBeenCalledOnce();
    expect(sdkMock.verifyAuthBearerToken).toHaveBeenCalledWith(token, {
      audience: "http://localhost:8765",
    });
  });

  it("falls through when verifyAuthBearerToken returns false", async () => {
    sdkMock.verifyAuthBearerToken.mockResolvedValueOnce(false);
    const helpers = makeHelpers();
    app = await startApp("http://localhost:8765", helpers, (req, res) => {
      res.json((req as unknown as { remote_user: unknown }).remote_user);
    });
    const headerB64 = Buffer.from(
      JSON.stringify({ alg: "ES256", typ: "JWT" }),
    ).toString("base64url");
    const res = await fetch(`${app.url}/x`, {
      headers: { authorization: `Bearer ${headerB64}.eyJhIjoiYiJ9.sig` },
    });
    expect(await res.json()).not.toHaveProperty("name");
  });

  it("falls through when verifyAuthBearerToken throws", async () => {
    sdkMock.verifyAuthBearerToken.mockRejectedValueOnce(new Error("boom"));
    const helpers = makeHelpers();
    app = await startApp("http://localhost:8765", helpers, (req, res) => {
      res.json((req as unknown as { remote_user: unknown }).remote_user);
    });
    const headerB64 = Buffer.from(
      JSON.stringify({ alg: "ES256", typ: "JWT" }),
    ).toString("base64url");
    const res = await fetch(`${app.url}/x`, {
      headers: { authorization: `Bearer ${headerB64}.eyJhIjoiYiJ9.sig` },
    });
    expect(await res.json()).not.toHaveProperty("name");
  });

  it("falls through when credential subject has no address", async () => {
    sdkMock.verifyAuthBearerToken.mockResolvedValueOnce({
      payload: { aud: "http://localhost:8765" },
      verifiableCredential: { credentialSubject: { chainId: 1 } },
    });
    const helpers = makeHelpers();
    app = await startApp("http://localhost:8765", helpers, (req, res) => {
      res.json((req as unknown as { remote_user: unknown }).remote_user);
    });
    const headerB64 = Buffer.from(
      JSON.stringify({ alg: "ES256", typ: "JWT" }),
    ).toString("base64url");
    const res = await fetch(`${app.url}/x`, {
      headers: { authorization: `Bearer ${headerB64}.eyJhIjoiYiJ9.sig` },
    });
    expect(await res.json()).not.toHaveProperty("name");
  });
});

describe("verdaccio-auth-renown-plugin: authenticate / allow_*", () => {
  it("authenticate always falls through (no Basic auth support)", () => {
    const plugin = makePlugin("http://localhost");
    const cb = vi.fn();
    plugin.authenticate("user", "pass", cb);
    expect(cb).toHaveBeenCalledWith(null, false);
  });

  it("allow_access permits everything (per-package config drives access)", () => {
    const plugin = makePlugin("http://localhost");
    const cb = vi.fn();
    plugin.allow_access(
      { name: "anyone", groups: [], real_groups: [] },
      {} as never,
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it("allow_publish permits when real_groups contains $authenticated", () => {
    const plugin = makePlugin("http://localhost");
    const cb = vi.fn();
    plugin.allow_publish(
      {
        name: "0xabc",
        groups: ["$authenticated", "renown"],
        real_groups: ["$authenticated", "renown"],
      },
      {} as never,
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it("allow_publish denies anonymous", () => {
    const plugin = makePlugin("http://localhost");
    const cb = vi.fn();
    plugin.allow_publish(
      { name: undefined, groups: [], real_groups: [] } as never,
      {} as never,
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, false);
  });
});
