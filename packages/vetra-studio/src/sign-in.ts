import type { API, Context, ISubgraph } from "@powerhousedao/reactor-api";
import { GraphQLError, parse } from "graphql";

/**
 * Studio sign-in: hands the studio's own Renown identity (the project's CLI
 * key pair and the user `ph login` delegated it to) to a caller that proves
 * it is a listed admin with a bearer, typically one `ph access-token` minted.
 * The browser installs the key pair as its Renown key and logs in with the
 * user's DID, so an agent reaches a real Renown session in Connect without a
 * wallet. Served only by a studio (dev verb) switchboard.
 */

export const STUDIO_SUBGRAPH_NAME = "vetra-studio";

export const studioTypeDefs = parse(/* GraphQL */ `
  type StudioKeyPair {
    "The public JWK, as JSON."
    publicKey: String!
    "The private JWK, as JSON."
    privateKey: String!
  }

  type StudioIdentity {
    "did:pkh of the user the key is delegated by; log in with it."
    userDid: String!
    "did:key of the key pair."
    did: String!
    address: String!
    chainId: Int!
    keyPair: StudioKeyPair!
  }

  type Query {
    "Whether this switchboard serves studio sign-in (a studio dev host)."
    studioSignInAvailable: Boolean!
  }

  type Mutation {
    """
    The studio's Renown identity, for a listed admin's bearer: install the key
    pair in the browser and log in with userDid. Studio (dev) hosts only.
    """
    studioSignIn: StudioIdentity!
  }
`);

/** The switchboard facts the sign-in decides from. */
export type StudioApi = Pick<API, "authorizationService"> & {
  authService: unknown;
};

/** The parts of the host's Renown instance the sign-in reads. */
export type StudioRenown = {
  readonly did: string;
  readonly user: { did: string; address: string; chainId: number } | undefined;
};

export type JwkPair = { publicKey: JsonWebKey; privateKey: JsonWebKey };

export type StudioSignInDeps = {
  api: StudioApi;
  renown: StudioRenown | null | undefined;
  /** The key pair the host signs with (its NodeKeyStorage). */
  loadKeyPair: () => Promise<JwkPair | undefined>;
};

function forbidden(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "FORBIDDEN" } });
}

export function isListedAdmin(
  admins: readonly string[],
  address: string | undefined,
): boolean {
  if (!address) return false;
  const caller = address.toLowerCase();
  return admins.some((admin) => admin.toLowerCase() === caller);
}

export async function studioSignIn(
  deps: StudioSignInDeps,
  ctx: Pick<Context, "user">,
) {
  if (deps.api.authService === undefined) {
    throw forbidden(
      "Studio sign-in needs the switchboard to read bearers: set AUTH_ENABLED=true and list your address in ADMINS.",
    );
  }
  const address = ctx.user?.address;
  if (!address) {
    throw forbidden(
      "Studio sign-in needs a bearer: pass one from `ph access-token`.",
    );
  }
  if (!isListedAdmin(deps.api.authorizationService.config.admins, address)) {
    throw forbidden("Studio sign-in is for the host's admins.");
  }
  const user = deps.renown?.user;
  if (!deps.renown || !user) {
    throw forbidden(
      "This studio has no signed-in Renown identity: run `ph login` in the project, then restart it.",
    );
  }
  const keyPair = await deps.loadKeyPair();
  if (!keyPair) {
    throw forbidden("This studio has no key pair to hand over.");
  }
  return {
    userDid: user.did,
    did: deps.renown.did,
    address: user.address,
    chainId: user.chainId,
    keyPair: {
      publicKey: JSON.stringify(keyPair.publicKey),
      privateKey: JSON.stringify(keyPair.privateKey),
    },
  };
}

export function createStudioSubgraph(
  deps: StudioSignInDeps & { relationalDb: API["relationalDb"] },
): ISubgraph {
  return {
    name: STUDIO_SUBGRAPH_NAME,
    typeDefs: studioTypeDefs,
    relationalDb: deps.relationalDb,
    hasSubscriptions: false,
    resolvers: {
      Query: { studioSignInAvailable: () => true },
      Mutation: {
        studioSignIn: (_parent: unknown, _args: unknown, ctx: Context) =>
          studioSignIn(deps, ctx),
      },
    },
  };
}
