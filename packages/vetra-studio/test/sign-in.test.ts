import { describe, expect, it, vi } from "vitest";
import { studioSignIn, type StudioSignInDeps } from "../src/sign-in.js";
import { createStudioSwitchboardPlugin } from "../src/switchboard.js";

const ADMIN = "0x763810e8d4129A7347bA9Ad6235fFD0568558Fb4";
const keyPair = {
  publicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
  privateKey: { kty: "EC", crv: "P-256", x: "x", y: "y", d: "d" },
};

function deps(overrides: Partial<StudioSignInDeps> = {}): StudioSignInDeps {
  return {
    api: {
      authService: {},
      authorizationService: {
        config: { admins: [ADMIN.toLowerCase()] },
      } as never,
    },
    renown: {
      did: "did:key:zHost",
      user: {
        did: `did:pkh:eip155:1:${ADMIN.toLowerCase()}`,
        address: ADMIN,
        chainId: 1,
      },
    },
    loadKeyPair: () => Promise.resolve(keyPair),
    ...overrides,
  };
}

const admin = { user: { address: ADMIN } } as never;

describe("studioSignIn", () => {
  it("hands a listed admin the studio's identity and key pair", async () => {
    const identity = await studioSignIn(deps(), admin);
    expect(identity).toEqual({
      userDid: `did:pkh:eip155:1:${ADMIN.toLowerCase()}`,
      did: "did:key:zHost",
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

  it("refuses when the studio has no signed-in identity or no key pair", async () => {
    await expect(
      studioSignIn(
        deps({ renown: { did: "did:key:zHost", user: undefined } }),
        admin,
      ),
    ).rejects.toThrow(/ph login/);
    await expect(
      studioSignIn(
        deps({ loadKeyPair: () => Promise.resolve(undefined) }),
        admin,
      ),
    ).rejects.toThrow(/no key pair/);
  });
});

describe("the studio switchboard plugin", () => {
  it("keeps dev mode on and registers the sign-in subgraph", async () => {
    const plugin = createStudioSwitchboardPlugin(
      () => () => Promise.resolve(keyPair),
    );
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
});
