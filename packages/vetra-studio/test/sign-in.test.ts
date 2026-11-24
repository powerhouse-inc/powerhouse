import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { subtle } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { studioSignIn, type StudioSignInDeps } from "../src/sign-in.js";
import studioSwitchboardPlugin, {
  createStudioSwitchboardPlugin,
  homeLoginLoader,
} from "../src/switchboard.js";

const ADMIN = "0x763810e8d4129A7347bA9Ad6235fFD0568558Fb4";
const keyPair = {
  publicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
  privateKey: { kty: "EC", crv: "P-256", x: "x", y: "y", d: "d" },
};
const generated = await subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const realKeyPair = {
  publicKey: await subtle.exportKey("jwk", generated.publicKey),
  privateKey: await subtle.exportKey("jwk", generated.privateKey),
};

const login = {
  did: "did:key:zLogin",
  user: {
    did: `did:pkh:eip155:1:${ADMIN.toLowerCase()}`,
    address: ADMIN,
    chainId: 1,
  },
  keyPair,
};

function deps(overrides: Partial<StudioSignInDeps> = {}): StudioSignInDeps {
  return {
    api: {
      authService: {},
      authorizationService: {
        config: { admins: [ADMIN.toLowerCase()] },
      } as never,
    },
    loadLogin: () => Promise.resolve(login),
    ...overrides,
  };
}

const admin = { user: { address: ADMIN } } as never;

describe("studioSignIn", () => {
  it("hands a listed admin the person's login and its key pair", async () => {
    const identity = await studioSignIn(deps(), admin);
    expect(identity).toEqual({
      userDid: `did:pkh:eip155:1:${ADMIN.toLowerCase()}`,
      did: "did:key:zLogin",
      address: ADMIN,
      chainId: 1,
      keyPair: {
        publicKey: JSON.stringify(keyPair.publicKey),
        privateKey: JSON.stringify(keyPair.privateKey),
      },
    });
  });

  it("refuses an anonymous caller, a non-admin and a host that reads no bearers", async () => {
    await expect(studioSignIn(deps(), { user: undefined })).rejects.toThrow(
      /needs a bearer/,
    );
    await expect(
      studioSignIn(deps(), { user: { address: "0xother" } } as never),
    ).rejects.toThrow(/for the host's admins/);
    await expect(
      studioSignIn(
        deps({
          api: {
            authService: undefined,
            authorizationService: { config: { admins: [ADMIN] } } as never,
          },
        }),
        admin,
      ),
    ).rejects.toThrow(/AUTH_ENABLED/);
  });

  it("refuses when nobody is logged in on this computer", async () => {
    await expect(
      studioSignIn(
        deps({ loadLogin: () => Promise.resolve(undefined) }),
        admin,
      ),
    ).rejects.toThrow(/run `ph login`/);
  });
});

describe("homeLoginLoader", () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(path.join(tmpdir(), "studio-login-"));
    vi.stubEnv("PH_IDENTITY_HOME", home);
    vi.stubEnv("PH_RENOWN_PRIVATE_KEY", undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  });

  it("reads the home folder's login, never the switchboard's key", async () => {
    expect(await homeLoginLoader()).toBeUndefined();
    // Where `ph login` keeps it (shared/clis/identity loginPaths).
    const dir = path.join(home, "renown");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, ".keypair.json"),
      JSON.stringify({ keyPair: realKeyPair }),
    );
    writeFileSync(
      path.join(dir, ".renown.json"),
      JSON.stringify({
        user: {
          ...login.user,
          networkId: "eip155",
          credential: {
            id: "urn:uuid:1",
            expirationDate: new Date(Date.now() + 60_000).toISOString(),
          },
        },
      }),
    );
    const read = await homeLoginLoader();
    expect(read).toMatchObject({ user: login.user, keyPair: realKeyPair });
    expect(read?.did).toMatch(/^did:key:/);
  });
});

describe("the studio switchboard plugin", () => {
  it("keeps dev mode on and registers the sign-in subgraph", async () => {
    const plugin = createStudioSwitchboardPlugin(() => Promise.resolve(login));
    expect(plugin.hooks?.transformServerOptions?.({ a: 1 })).toEqual({
      a: 1,
      dev: true,
    });
    const registerSubgraphInstance = vi.fn(() => Promise.resolve());
    const ctx = {
      api: { authorizationService: {}, relationalDb: {}, authService: {} },
      graphqlManager: { registerSubgraphInstance },
      renown: null,
      lateSubgraphs: [] as Promise<unknown>[],
    };
    await plugin.hooks?.onSubgraphsRegistering?.(ctx);
    expect(registerSubgraphInstance).toHaveBeenCalledWith(
      expect.objectContaining({ name: "vetra-studio" }),
      "graphql",
      false,
    );
    expect(ctx.lateSubgraphs).toHaveLength(1);
  });

  it("adds the entry's processorConfig to the server's, next to what is there", () => {
    const vetraConfig = {
      interactive: true,
      driveUrl: "http://localhost:4001/d/vetra-1234abcd",
      driveId: "vetra-1234abcd",
    };
    // the default export is a factory: host-core hands it the entry config
    const plugin = studioSwitchboardPlugin({
      processorConfig: { VetraConfig: vetraConfig },
    });
    expect(plugin.name).toBe("vetra-studio-switchboard");
    const transform = plugin.hooks?.transformServerOptions;

    expect(transform?.({ a: 1 })).toEqual({
      a: 1,
      dev: true,
      processorConfig: new Map([["VetraConfig", vetraConfig]]),
    });

    const given = new Map<string, unknown>([["Other", { b: 2 }]]);
    expect(transform?.({ processorConfig: given })).toEqual({
      dev: true,
      processorConfig: new Map<string, unknown>([
        ["Other", { b: 2 }],
        ["VetraConfig", vetraConfig],
      ]),
    });
    // the caller's map is left as it was
    expect([...given.keys()]).toEqual(["Other"]);

    // no config (the entry as scaffolded): options pass with dev mode only
    expect(
      studioSwitchboardPlugin().hooks?.transformServerOptions?.({ a: 1 }),
    ).toEqual({ a: 1, dev: true });
  });
});
