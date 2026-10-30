/**
 * Studio sign-in, browser side (`@powerhousedao/vetra-studio/connect`): an
 * agent opens the studio with `#studio-sign-in=<bearer>` (a bearer from
 * `ph access-token`), the studio switchboard hands the studio's Renown
 * identity to that admin bearer, and the page installs the key pair as this
 * browser's Renown key and logs in with the user's DID through the normal
 * `?user=` redirect login. `#studio-sign-out` drops the key and the session.
 *
 * The bearer rides in the fragment, so it never reaches a server or a log,
 * and the page strips it from the address bar before doing anything else.
 */

export const STUDIO_SIGN_IN_PARAM = "studio-sign-in";
export const STUDIO_SIGN_OUT_PARAM = "studio-sign-out";
/** Optional: the switchboard GraphQL URL, when the studio does not proxy it. */
export const STUDIO_SWITCHBOARD_PARAM = "switchboard";

export type StudioSignInRequest =
  | { kind: "sign-in"; token: string; switchboardUrl?: string }
  | { kind: "sign-out" };

/** The request a location fragment carries, if any. */
export function readStudioSignInRequest(
  hash: string,
): StudioSignInRequest | undefined {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (params.has(STUDIO_SIGN_OUT_PARAM)) return { kind: "sign-out" };
  const token = params.get(STUDIO_SIGN_IN_PARAM)?.trim();
  if (!token) return undefined;
  const switchboardUrl = params.get(STUDIO_SWITCHBOARD_PARAM)?.trim();
  return {
    kind: "sign-in",
    token,
    ...(switchboardUrl ? { switchboardUrl } : {}),
  };
}

type Jwk = Record<string, unknown>;

export type StudioSignInEnv = {
  fetch: typeof globalThis.fetch;
  /** The page's origin; the studio proxies `/graphql` on it to its switchboard. */
  origin: string;
  keyStorage: {
    saveKeyPair(keyPair: { publicKey: Jwk; privateKey: Jwk }): Promise<void>;
    removeKeyPair(): Promise<void>;
  };
  /** Clears the stored Renown user, so the next boot logs in afresh. */
  logout(): Promise<void>;
};

export type StudioIdentity = {
  userDid: string;
  did: string;
  address: string;
  chainId: number;
};

const SIGN_IN_MUTATION = /* GraphQL */ `
  mutation StudioSignIn {
    studioSignIn {
      userDid
      did
      address
      chainId
      keyPair {
        publicKey
        privateKey
      }
    }
  }
`;

type SignInResponse = {
  data?: {
    studioSignIn?:
      | (StudioIdentity & {
          keyPair: { publicKey: string; privateKey: string };
        })
      | null;
  } | null;
  errors?: { message: string }[];
};

/**
 * Asks the switchboard for the studio identity with `request.token`, installs
 * its key pair as this browser's Renown key and clears the stored user.
 * Resolves with the identity to log in as; throws with the switchboard's
 * reason when it refuses.
 */
export async function signInAsStudio(
  request: Extract<StudioSignInRequest, { kind: "sign-in" }>,
  env: StudioSignInEnv,
): Promise<StudioIdentity> {
  const url = request.switchboardUrl ?? `${env.origin}/graphql`;
  let response: Response;
  try {
    response = await env.fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${request.token}`,
      },
      body: JSON.stringify({ query: SIGN_IN_MUTATION }),
    });
  } catch (error) {
    throw new Error(
      `The studio switchboard at ${url} could not be reached: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const body = (await response.json().catch(() => undefined)) as
    | SignInResponse
    | undefined;
  const identity = body?.data?.studioSignIn;
  if (!identity) {
    const reason =
      body?.errors?.map((e) => e.message).join("; ") ||
      `HTTP ${response.status}`;
    throw new Error(`The studio refused the sign-in: ${reason}`);
  }
  await env.logout();
  await env.keyStorage.saveKeyPair({
    publicKey: JSON.parse(identity.keyPair.publicKey) as Jwk,
    privateKey: JSON.parse(identity.keyPair.privateKey) as Jwk,
  });
  return {
    userDid: identity.userDid,
    did: identity.did,
    address: identity.address,
    chainId: identity.chainId,
  };
}

/** Drops the installed key and the session: the next boot makes a fresh key. */
export async function signOutOfStudio(env: StudioSignInEnv): Promise<void> {
  await env.logout();
  await env.keyStorage.removeKeyPair();
}

/** Where to reload to: the same page, with the `?user=` login Connect runs at boot. */
export function signedInLocation(
  location: { pathname: string; search: string },
  userDid: string,
): string {
  const params = new URLSearchParams(location.search);
  params.set("user", userDid);
  return `${location.pathname}?${params.toString()}`;
}
