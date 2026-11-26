import {
  enrolBrowserCredential,
  ensureBrowserPseudonym,
  issueBrowserCredential,
  readBrowserPseudonym,
  type BrowserPseudonym,
  type IRenown,
  type PowerhouseVerifiableCredential,
  type PseudonymStore,
} from "@renown/sdk";
import { logger } from "document-model";
import { setLocalSignIn } from "../hooks/local-sign-in.js";
import {
  credentialEndsWithin,
  LOCAL_SIGN_IN_RENEW_DAYS,
} from "./local-sign-in.js";
import { notifyReactorClientCredentialsChanged } from "./session.js";

/**
 * Hosted Connect without a login (F3d): at the first signature with nobody
 * logged in, this browser's pseudonym (made when it has none, kept in
 * IndexedDB) signs a credential for the tab's session key, the tab signs in
 * with it (`localIdentity: "browser"`), and the switchboards it writes to are
 * asked to keep its record. A page a local server signs in by link is left to
 * its link, so one person does not get two pseudonyms, and the page shows
 * where that link is (`localSignIn` "needs-link").
 */

const RENEW_EVERY_MS = 6 * 60 * 60_000;
const ENROL_TIMEOUT_MS = 5_000;

export type BrowserIdentityOptions = {
  renown: IRenown;
  /** Where the pseudonym is kept: `BrowserKeyStorage.create()`. */
  store: () => Promise<PseudonymStore>;
  /** The base URLs of the switchboards the tab writes to, asked per enrolment. */
  hosts: () => readonly string[];
  /** Whether a local server signs this page in by link (`GET __ph/sign-in`). */
  localSignInAvailable: () => Promise<boolean>;
  /** The chain the tab's bearers name. */
  chainId?: number;
  now?: () => number;
  fetch?: typeof globalThis.fetch;
  renewEveryMs?: number;
};

export interface BrowserIdentity {
  /** Nobody signed in: signs the browser's pseudonym in. Shared while running. */
  ensure(): Promise<void>;
  /** Under seven days left: a new credential, enrolled again. */
  renew(): Promise<void>;
  /** Enrols the current credential at the switchboard of `url`: whether it took. */
  enrolAt(url: string): Promise<boolean>;
  /** Renews now and every six hours. */
  start(): void;
  stop(): void;
}

/** A switchboard's base URL from its GraphQL endpoint (or base). */
export function switchboardBaseOf(url: string): string {
  return url.replace(/\/graphql(?:\/.*)?$/, "").replace(/\/+$/, "");
}

export function createBrowserIdentity(
  o: BrowserIdentityOptions,
): BrowserIdentity {
  const { renown } = o;
  const now = o.now ?? Date.now;
  const baseFetch: typeof globalThis.fetch =
    o.fetch ?? ((input, init) => globalThis.fetch(input, init));
  // Enrolment must not hold a signature for long: a host that is away is
  // asked again at its next refusal.
  const fetch: typeof globalThis.fetch = (input, init) =>
    baseFetch(input, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(ENROL_TIMEOUT_MS),
    });
  let pending: Promise<void> | undefined;
  let leftToLink = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const enrolling = new Map<string, Promise<boolean>>();

  async function enrol(
    pseudonym: BrowserPseudonym,
    credential: PowerhouseVerifiableCredential,
    hosts: readonly string[],
  ): Promise<boolean> {
    const outcomes = await enrolBrowserCredential({
      pseudonym,
      credential,
      hosts: hosts.map(switchboardBaseOf),
      fetch,
    });
    for (const outcome of outcomes) {
      if (!outcome.ok) {
        logger.warn(
          "Could not enrol this browser's pseudonym at @host: @error",
          outcome.host,
          outcome.error,
        );
      }
    }
    return outcomes.every((outcome) => outcome.ok);
  }

  async function signIn(pseudonym: BrowserPseudonym): Promise<void> {
    const credential = await issueBrowserCredential(pseudonym, {
      sessionDid: renown.did,
      ...(o.chainId === undefined ? {} : { chainId: o.chainId }),
    });
    await enrol(pseudonym, credential, o.hosts());
    await renown.adoptCredential(credential, {
      local: true,
      localIdentity: "browser",
    });
    notifyReactorClientCredentialsChanged();
  }

  /** The kept pseudonym, when it is the signed-in browser identity's. */
  async function currentPseudonym(): Promise<BrowserPseudonym | undefined> {
    const user = renown.user;
    if (user?.localIdentity !== "browser") return undefined;
    const pseudonym = await readBrowserPseudonym(await o.store());
    return pseudonym?.address.toLowerCase() === user.address.toLowerCase()
      ? pseudonym
      : undefined;
  }

  async function renew(): Promise<void> {
    const user = renown.user;
    if (
      user?.localIdentity !== "browser" ||
      !credentialEndsWithin(user.credential, LOCAL_SIGN_IN_RENEW_DAYS, now())
    ) {
      return;
    }
    // The site's data went: nothing left to sign with.
    const pseudonym = await currentPseudonym();
    if (pseudonym) await signIn(pseudonym);
  }

  return {
    ensure() {
      if (renown.user || leftToLink) return Promise.resolve();
      pending ??= (async () => {
        if (await o.localSignInAvailable()) {
          // Once: the page says where its link is, and is left to it.
          leftToLink = true;
          setLocalSignIn({
            status: "needs-link",
            dismiss: () => setLocalSignIn(undefined),
          });
          return;
        }
        await signIn(await ensureBrowserPseudonym(await o.store(), now));
      })().finally(() => {
        pending = undefined;
      });
      return pending;
    },
    renew,
    enrolAt(url) {
      const base = switchboardBaseOf(url);
      let running = enrolling.get(base);
      if (!running) {
        running = (async () => {
          const credential = renown.user?.credential;
          const pseudonym = await currentPseudonym();
          if (!pseudonym || !credential) return false;
          return enrol(pseudonym, credential, [base]);
        })().finally(() => enrolling.delete(base));
        enrolling.set(base, running);
      }
      return running;
    },
    start() {
      const run = () =>
        void renew().catch((error: unknown) =>
          logger.warn(
            "Could not renew this browser's pseudonym: @error",
            error,
          ),
        );
      run();
      timer ??= setInterval(run, o.renewEveryMs ?? RENEW_EVERY_MS);
    },
    stop() {
      clearInterval(timer);
      timer = undefined;
    },
  };
}
