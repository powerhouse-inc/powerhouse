import express, { type Request, type Response } from "express";
import http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenownAuthMiddleware } from "../src/auth/renown-middleware.js";

const sdkMock = vi.hoisted(() => ({
  verifyAuthBearerToken: vi.fn(),
}));
vi.mock("@renown/sdk/node", () => sdkMock);

const sigMock = vi.hoisted(() => ({
  signPayload: vi.fn(),
}));
vi.mock("@verdaccio/signature", () => sigMock);

interface ListeningServer {
  url: string;
  close(): Promise<void>;
}

async function startApp(handler: (req: Request, res: Response) => void) {
  const app = express();
  app.use(
    createRenownAuthMiddleware({
      publicUrl: "https://registry.dev.vetra.io",
      verdaccioSecret: "test-secret",
    }),
  );
  app.use((req, res) => handler(req, res));
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
  } satisfies ListeningServer;
}

describe("createRenownAuthMiddleware", () => {
  let app: ListeningServer | undefined;

  beforeEach(() => {
    sdkMock.verifyAuthBearerToken.mockReset();
    sigMock.signPayload.mockReset();
  });

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  it("falls through unmodified when no Authorization header is present", async () => {
    app = await startApp((req, res) => {
      res.json({
        auth: req.headers.authorization ?? null,
        renown: req.renownUser ?? null,
      });
    });

    const res = await fetch(`${app.url}/-/whoami`);
    expect(await res.json()).toEqual({ auth: null, renown: null });
    expect(sdkMock.verifyAuthBearerToken).not.toHaveBeenCalled();
  });

  it("falls through when the token verifies but audience mismatches", async () => {
    sdkMock.verifyAuthBearerToken.mockResolvedValueOnce({
      payload: { aud: "https://different.example", iss: "did:key:z6Mk..." },
      verifiableCredential: {
        credentialSubject: {
          address: "0xabc",
          chainId: 1,
          networkId: "eip155",
        },
      },
    });

    app = await startApp((req, res) => {
      res.json({
        auth: req.headers.authorization ?? null,
        renown: req.renownUser ?? null,
      });
    });

    const res = await fetch(`${app.url}/somepath`, {
      headers: { authorization: "Bearer token-x" },
    });
    expect(await res.json()).toEqual({
      auth: "Bearer token-x",
      renown: null,
    });
    expect(sigMock.signPayload).not.toHaveBeenCalled();
  });

  it("swaps the Authorization header when the token verifies for this audience", async () => {
    sdkMock.verifyAuthBearerToken.mockResolvedValueOnce({
      payload: {
        aud: "https://registry.dev.vetra.io",
        iss: "did:key:z6Mk-issuer",
      },
      verifiableCredential: {
        credentialSubject: {
          address: "0xABCDEF1234567890",
          chainId: 1,
          networkId: "eip155",
        },
      },
    });
    sigMock.signPayload.mockResolvedValueOnce("verdaccio-jwt-internal");

    app = await startApp((req, res) => {
      res.json({
        auth: req.headers.authorization ?? null,
        renown: req.renownUser ?? null,
      });
    });

    const res = await fetch(`${app.url}/-/v1/something`, {
      headers: { authorization: "Bearer renown-token" },
    });
    const body = (await res.json()) as {
      auth: string | null;
      renown: { address: string; did?: string } | null;
    };
    expect(body.auth).toBe("Bearer verdaccio-jwt-internal");
    expect(body.renown).toMatchObject({
      address: "0xabcdef1234567890",
      did: "did:key:z6Mk-issuer",
    });

    expect(sigMock.signPayload).toHaveBeenCalledOnce();
    const [payload, secret, opts] = sigMock.signPayload.mock.calls[0];
    expect(payload).toMatchObject({
      name: "0xabcdef1234567890",
      groups: expect.arrayContaining(["$authenticated", "renown"]),
      real_groups: expect.arrayContaining(["$authenticated", "renown"]),
    });
    expect(secret).toBe("test-secret");
    expect(opts).toMatchObject({ expiresIn: "5m" });
  });

  it("falls through when verification rejects", async () => {
    sdkMock.verifyAuthBearerToken.mockResolvedValueOnce(false);

    app = await startApp((req, res) => {
      res.json({ auth: req.headers.authorization ?? null });
    });

    const res = await fetch(`${app.url}/x`, {
      headers: { authorization: "Bearer bad-token" },
    });
    expect(await res.json()).toEqual({ auth: "Bearer bad-token" });
    expect(sigMock.signPayload).not.toHaveBeenCalled();
  });

  it("accepts an audience array that contains the registry URL", async () => {
    sdkMock.verifyAuthBearerToken.mockResolvedValueOnce({
      payload: {
        aud: ["https://other.example", "https://registry.dev.vetra.io"],
        iss: "did:key:z6Mk-issuer",
      },
      verifiableCredential: {
        credentialSubject: {
          address: "0xfeed",
          chainId: 1,
          networkId: "eip155",
        },
      },
    });
    sigMock.signPayload.mockResolvedValueOnce("verdaccio-jwt-multi-aud");

    app = await startApp((req, res) => {
      res.json({ auth: req.headers.authorization ?? null });
    });

    const res = await fetch(`${app.url}/x`, {
      headers: { authorization: "Bearer multi-aud-token" },
    });
    expect(await res.json()).toEqual({
      auth: "Bearer verdaccio-jwt-multi-aud",
    });
  });
});
