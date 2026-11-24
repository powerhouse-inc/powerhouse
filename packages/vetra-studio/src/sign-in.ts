import type { API, Context, ISubgraph } from "@powerhousedao/reactor-api";
import { GraphQLError, parse } from "graphql";

/**
 * Studio sign-in: hands the person's Renown login (the key pair `ph login`
 * keeps in the home folder and the user it is delegated by) to a caller that
 * proves it is a listed admin with a bearer, typically one `ph access-token`
 * minted. The browser installs the key pair as its Renown key and logs in
 * with the user's DID, so an agent reaches a real Renown session in Connect
 * without a wallet. Served only by a studio (dev verb) switchboard. The
 * instance's own key never leaves the host.
 *
 * Temporary (F3a): F3d replaces this hand-over with a one-time code, and from
 * then on no host reads the person's login.
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
    The person's Renown login, for a listed admin's bearer: install the key
    pair in the browser and log in with userDid. Studio (dev) hosts only.
    """
    studioSignIn: StudioIdentity!
  }
`);

/** The switchboard facts the sign-in decides from. */
export type StudioApi = Pick<API, "authorizationService"> & {
  authService: unknown;
};

export type JwkPair = { publicKey: JsonWebKey; privateKey: JsonWebKey };

/** The person's Renown login: its session key and the user it names. */
export type StudioLogin = {
  /** did:key of the key pair. */
  did: string;
  user: { did: string; address: string; chainId: number };
  keyPair: JwkPair;
};

export type StudioSignInDeps = {
  api: StudioApi;
  /** The login `ph login` keeps in the home folder, read per sign-in. */
  loadLogin: () => Promise<StudioLogin | undefined>;
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
  const login = await deps.loadLogin();
  if (!login) {
    throw forbidden(
      "No Renown login on this computer: run `ph login`, then sign in again.",
    );
  }
  const { user, keyPair } = login;
  return {
    userDid: user.did,
    did: login.did,
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
