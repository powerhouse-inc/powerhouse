/**
 * ACCESS=licensed end to end: a real server, a stand-in for Vetra's gate, and
 * a mocked Renown bearer verification.
 */
import {
  ChannelScheme,
  EventBus,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "document-model";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { assertAccessConfig, initializeAndStartAPI } from "../src/server.js";

const mockVerifyAuthBearerToken = vi.fn();

vi.mock("@renown/sdk", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  verifyAuthBearerToken: (...args: unknown[]) =>
    mockVerifyAuthBearerToken(...args),
}));

const ADMIN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HOLDER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const STRANGER = "0xcccccccccccccccccccccccccccccccccccccccc";
const TOKEN = "vgt_" + "cd".repeat(32);

const initializeClient = async (documentModels: DocumentModelModule[]) => {
  const builder = new ReactorBuilder()
    .withEventBus(new EventBus())
    .withDocumentModelSources(documentModels)
    .withChannelScheme(ChannelScheme.SWITCHBOARD);
  const module = await new ReactorClientBuilder()
    .withReactorBuilder(builder)
    .buildModule();
  return { module };
};

/** Bearer `Bearer <address>` verifies as that address. */
mockVerifyAuthBearerToken.mockImplementation((token: string) =>
  Promise.resolve({
    verifiableCredential: {
      credentialSubject: { address: token, chainId: 1, networkId: "eip155" },
    },
    issuer: "did:key:app",
  }),
);

let vetra: Server;
let gateUrl: string;
const gateCalls: Array<{ authorization?: string; address: string }> = [];

beforeAll(async () => {
  vetra = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      const { address } = JSON.parse(body) as { address: string };
      gateCalls.push({ authorization: req.headers.authorization, address });
      res.setHeader("content-type", "application/json");
      if (req.headers.authorization !== `Bearer ${TOKEN}`) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "UNAUTHENTICATED" }));
        return;
      }
      const allowed = address === HOLDER;
      res.end(
        JSON.stringify({
          allowed,
          reason: allowed ? "licence" : "none",
          until: null,
          ttlSeconds: allowed ? 60 : 15,
        }),
      );
    });
  });
  await new Promise<void>((resolve) => vetra.listen(0, "127.0.0.1", resolve));
  gateUrl = `http://127.0.0.1:${(vetra.address() as AddressInfo).port}/gate/check`;
});

afterAll(async () => {
  await new Promise((resolve) => vetra.close(resolve));
});

describe("assertAccessConfig", () => {
  const gate = { gateUrl: "https://vetra.example/gate", gateToken: TOKEN };

  it("is open when unset or open", () => {
    expect(assertAccessConfig(undefined, false)).toBe(false);
    expect(assertAccessConfig({ mode: "open" }, true)).toBe(false);
  });

  it("is licensed with an https gate and a token", () => {
    expect(assertAccessConfig({ mode: "licensed", ...gate }, false)).toBe(true);
  });

  it.each([
    ["no URL", { gateToken: TOKEN }],
    ["no token", { gateUrl: gate.gateUrl }],
    [
      "an http URL off localhost",
      { ...gate, gateUrl: "http://vetra.example/gate" },
    ],
    ["a URL that does not parse", { ...gate, gateUrl: "vetra" }],
  ])("refuses licensed with %s", (_name, access) => {
    expect(() =>
      assertAccessConfig({ mode: "licensed", ...access }, false),
    ).toThrow("ACCESS=licensed needs VETRA_GATE_URL and VETRA_GATE_TOKEN");
  });

  it("allows http on localhost, for tests", () => {
    expect(
      assertAccessConfig(
        { mode: "licensed", gateToken: TOKEN, gateUrl: "http://localhost:1/g" },
        false,
      ),
    ).toBe(true);
  });

  it("refuses licensed with SKIP_CREDENTIAL_VERIFICATION", () => {
    expect(() =>
      assertAccessConfig({ mode: "licensed", ...gate }, true),
    ).toThrow(/SKIP_CREDENTIAL_VERIFICATION/);
  });

  it("refuses members, pointing at licensed", () => {
    expect(() => assertAccessConfig({ mode: "members" }, false)).toThrow(
      "ACCESS=members is not supported; use ACCESS=licensed with Vetra's gate",
    );
  });

  it("refuses an unknown mode by name", () => {
    expect(() => assertAccessConfig({ mode: "everyone" }, false)).toThrow(
      "ACCESS=everyone is not supported",
    );
  });

  it("never puts the token in its errors", () => {
    for (const access of [
      { mode: "licensed", gateToken: TOKEN },
      { mode: "licensed", gateToken: TOKEN, gateUrl: "http://x.example" },
    ]) {
      try {
        assertAccessConfig(access, false);
      } catch (error) {
        expect(String(error)).not.toContain(TOKEN);
      }
    }
  });
});

describe("a host booted with ACCESS=licensed", () => {
  let dispose: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await dispose?.();
    dispose = undefined;
    gateCalls.length = 0;
  });

  async function boot(
    auth: NonNullable<Parameters<typeof initializeAndStartAPI>[1]["auth"]>,
  ) {
    const api = await initializeAndStartAPI(
      initializeClient,
      {
        port: 0,
        dbPath: undefined,
        mcp: false,
        verifyCredential: () => Promise.resolve(true),
        auth,
      },
      "switchboard",
    );
    dispose = api.dispose;
    return api;
  }

  const licensed = () => ({
    admins: [ADMIN],
    access: { mode: "licensed", gateUrl, gateToken: TOKEN, appId: "app-1" },
  });

  async function graphql(port: number, address?: string) {
    const response = await fetch(`http://localhost:${port}/graphql`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(address ? { authorization: `Bearer ${address}` } : {}),
      },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    await response.text();
    return response.status;
  }

  it("refuses anonymous callers, refuses strangers, admits admins and holders", async () => {
    const api = await boot(licensed());

    expect(await graphql(api.port)).toBe(401);
    expect(await graphql(api.port, STRANGER)).toBe(403);
    expect(await graphql(api.port, HOLDER)).toBe(200);
    expect(await graphql(api.port, ADMIN)).toBe(200);

    expect(gateCalls.map((c) => c.address).sort()).toEqual([HOLDER, STRANGER]);
    expect(gateCalls.every((c) => c.authorization === `Bearer ${TOKEN}`)).toBe(
      true,
    );
  });

  it("keeps /health and /ready open", async () => {
    const api = await boot(licensed());
    for (const path of ["/health", "/ready"]) {
      const response = await fetch(`http://localhost:${api.port}${path}`);
      await response.text();
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    }
  });

  it("refuses everyone but admins when Vetra rejects the token", async () => {
    const api = await boot({
      ...licensed(),
      access: { ...licensed().access, gateToken: "vgt_wrong" },
    });
    expect(await graphql(api.port, HOLDER)).toBe(403);
    expect(await graphql(api.port, ADMIN)).toBe(200);
  });

  it("runs the OPEN policy among admitted callers, not ADMIN_ONLY", async () => {
    const api = await boot({ ...licensed(), enabled: true });
    expect(api.authorizationService.config.policy).toBe("OPEN");
  });

  it("runs DOCUMENT_PERMISSIONS when document permissions are on", async () => {
    const api = await boot({
      ...licensed(),
      enabled: true,
      documentPermissions: { enabled: true },
    });
    expect(api.authorizationService.config.policy).toBe("DOCUMENT_PERMISSIONS");
  });

  it("keeps ADMIN_ONLY for AUTH_ENABLED without ACCESS", async () => {
    const api = await boot({ enabled: true, admins: [ADMIN] });
    expect(api.authorizationService.config.policy).toBe("ADMIN_ONLY");
  });

  it.each([
    ["no URL", { mode: "licensed", gateToken: TOKEN }],
    ["no token", { mode: "licensed", gateUrl: "https://vetra.example/g" }],
  ])("refuses to boot with %s", async (_name, access) => {
    await expect(boot({ access })).rejects.toThrow(
      "ACCESS=licensed needs VETRA_GATE_URL and VETRA_GATE_TOKEN",
    );
  });

  it("refuses to boot with SKIP_CREDENTIAL_VERIFICATION", async () => {
    await expect(
      boot({ ...licensed(), skipCredentialVerification: true }),
    ).rejects.toThrow(/SKIP_CREDENTIAL_VERIFICATION/);
  });
});
