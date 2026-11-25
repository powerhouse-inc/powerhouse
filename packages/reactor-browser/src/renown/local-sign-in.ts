import type { IRenown, PowerhouseVerifiableCredential } from "@renown/sdk";
import { logger } from "document-model";
import { setLocalSignIn } from "../hooks/local-sign-in.js";
import {
  endSession,
  notifyReactorClientCredentialsChanged,
} from "./session.js";

/**
 * Sign-in by link, the page's side (F3d): `ph dev` and `ph vetra` open the
 * page with `#ph-sign-in=<code>`, and the page exchanges the code once, at the
 * loopback endpoint of the process that serves it, for a credential that names
 * its session key, signed by the person's identity on this computer. The page
 * adopts it as a local user (`localIdentity: "machine"`) and renews it there
 * while the server runs. A credential a switchboard refuses for good is
 * dropped, and the page says how to get a fresh link.
 */

/** As `LOCAL_SIGN_IN_ROUTES` of `@powerhousedao/shared/clis/local-sign-in`. */
const ROUTES = { signIn: "__ph/sign-in", renew: "__ph/renew" } as const;

/** The fragment a link carries, read and stripped at boot. */
export type SignInFragment =
  | { kind: "sign-in"; code: string }
  | { kind: "sign-out" };

/** How long before its end a credential is renewed. */
export const LOCAL_SIGN_IN_RENEW_DAYS = 7;

/** Refusals no retry with the same credential can change: it is dropped. */
export const DROPPED_CREDENTIAL_REASONS: ReadonlySet<string> = new Set([
  "expired",
  "withdrawn-here",
  "withdrawn-at-renown",
  "bad-credential",
]);

const DAY_MS = 86_400_000;
const RENEW_EVERY_MS = 6 * 60 * 60_000;
const PROBE_TIMEOUT_MS = 2_000;
// Unlocking a key with a password costs the server about a second.
const REQUEST_TIMEOUT_MS = 15_000;
const BOOT_RENEW_WAIT_MS = 3_000;

export type LocalSignInEndpoint = {
  /** The app's base path (`/` or `/<base>/`): the routes are under it. */
  base: string;
  /** The page's origin; default the window's. */
  origin?: string;
  fetch?: typeof globalThis.fetch;
};

export type LocalSignInIssued = {
  ok: true;
  credential: PowerhouseVerifiableCredential;
  identity: { kind: string; address: string; label: string };
  expiresAt: string;
  renewFrom: string;
};

export type LocalSignInRefused = {
  ok: false;
  status: number;
  /** `password-required`, `wrong-password`, `used-code`, `withdrawn`, ... */
  reason: string;
  triesLeft?: number;
  /** A Renown login's name (`renown-login`). */
  label?: string;
};

/** Undefined: the endpoint could not be reached, or is not one. */
export type LocalSignInAnswer = LocalSignInIssued | LocalSignInRefused;

function routeUrl(endpoint: LocalSignInEndpoint, route: string): string {
  const base = endpoint.base.endsWith("/")
    ? endpoint.base
    : `${endpoint.base}/`;
  const page = endpoint.origin
    ? `${endpoint.origin}/`
    : globalThis.location.href;
  return new URL(`${base}${route}`, page).href;
}

async function post(
  endpoint: LocalSignInEndpoint,
  route: string,
  body: Record<string, unknown>,
  bearer?: string,
): Promise<LocalSignInAnswer | undefined> {
  try {
    const response = await (endpoint.fetch ?? globalThis.fetch)(
      routeUrl(endpoint, route),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    const answer = (await response.json().catch(() => undefined)) as
      | Record<string, unknown>
      | undefined;
    if (!answer || typeof answer !== "object") return undefined;
    if (response.ok) {
      return answer.credential
        ? ({ ...answer, ok: true } as LocalSignInIssued)
        : undefined;
    }
    return {
      ok: false,
      status: response.status,
      reason: typeof answer.reason === "string" ? answer.reason : "failed",
      ...(typeof answer.triesLeft === "number"
        ? { triesLeft: answer.triesLeft }
        : {}),
      ...(typeof answer.label === "string" ? { label: answer.label } : {}),
    };
  } catch {
    return undefined;
  }
}

/** Whether the server that serves this page signs pages in by link. */
export async function localSignInAvailable(
  endpoint: LocalSignInEndpoint,
): Promise<boolean> {
  try {
    const response = await (endpoint.fetch ?? globalThis.fetch)(
      routeUrl(endpoint, ROUTES.signIn),
      { cache: "no-store", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) },
    );
    if (!response.ok) return false;
    const body = (await response.json().catch(() => undefined)) as
      | { available?: unknown }
      | undefined;
    return body?.available === true;
  } catch {
    return false;
  }
}

/** Exchanges a link's one-time code for a credential for `sessionDid`. */
export function exchangeLocalSignIn(
  endpoint: LocalSignInEndpoint,
  o: { code: string; sessionDid: string; password?: string },
): Promise<LocalSignInAnswer | undefined> {
  return post(endpoint, ROUTES.signIn, o);
}

/** A new credential for the session whose `bearer` carries one issued here. */
export function renewLocalSignIn(
  endpoint: LocalSignInEndpoint,
  o: { bearer: string; password?: string },
): Promise<LocalSignInAnswer | undefined> {
  return post(
    endpoint,
    ROUTES.renew,
    o.password === undefined ? {} : { password: o.password },
    o.bearer,
  );
}

/** Whether `credential` ends within `days` of `now` (or has ended). */
export function credentialEndsWithin(
  credential: { expirationDate?: string } | undefined,
  days: number,
  now: number,
): boolean {
  const ends = Date.parse(credential?.expirationDate ?? "");
  return !Number.isNaN(ends) && ends - now < days * DAY_MS;
}

/**
 * The tab's answer to a credential a switchboard refused (for
 * `setCredentialRefusalHandler`): a refusal for good drops it and the request
 * goes again anonymously; `not-registered` enrols the browser's pseudonym at
 * that switchboard and the request goes again with it.
 */
export function credentialRefusalHandler(o: {
  renown: IRenown;
  localSignIn: Pick<LocalSignIn, "drop">;
  browserIdentity?: { enrolAt(url: string): Promise<boolean> };
}): (refusal: {
  reason: string;
  url?: string;
}) => Promise<"anonymous" | "again" | undefined> {
  return async ({ reason, url }) => {
    if (DROPPED_CREDENTIAL_REASONS.has(reason)) {
      await o.localSignIn.drop(reason);
      return "anonymous";
    }
    if (
      reason === "not-registered" &&
      url &&
      o.browserIdentity &&
      o.renown.user?.localIdentity === "browser"
    ) {
      return (await o.browserIdentity.enrolAt(url)) ? "again" : undefined;
    }
    return undefined;
  };
}

export type LocalSignInOptions = LocalSignInEndpoint & {
  renown: IRenown;
  now?: () => number;
  renewEveryMs?: number;
};

export interface LocalSignIn {
  /**
   * At boot, before the clients: the link's sign-in or sign-out, a credential
   * past its date dropped, a renewal that is due. Then renews every six hours.
   */
  start(fragment: SignInFragment | undefined): Promise<void>;
  /** Renews this computer's credential once under seven days remain. */
  renew(): Promise<void>;
  /** Drops the current credential: a switchboard refused it with `reason`. */
  drop(reason: string): Promise<void>;
  stop(): void;
}

export function createLocalSignIn(o: LocalSignInOptions): LocalSignIn {
  const { renown } = o;
  const now = o.now ?? Date.now;
  let timer: ReturnType<typeof setInterval> | undefined;
  const dismiss = () => setLocalSignIn(undefined);

  async function adopt(answer: LocalSignInIssued): Promise<void> {
    // The link names the person on this computer: whoever was signed in
    // steps aside.
    if (renown.user && renown.user.localIdentity !== "machine") {
      await endSession(renown);
    }
    await renown.adoptCredential(answer.credential, {
      local: true,
      localIdentity: "machine",
    });
    setLocalSignIn(undefined);
    notifyReactorClientCredentialsChanged();
  }

  /** Asks the password while the server keeps the code (or the bearer). */
  function askPassword(
    triesLeft: number | undefined,
    retry: (password: string) => Promise<void>,
  ): void {
    setLocalSignIn({
      status: "password",
      ...(triesLeft === undefined ? {} : { triesLeft }),
      submit: retry,
      dismiss,
    });
  }

  async function signIn(code: string, password?: string): Promise<void> {
    const answer = await exchangeLocalSignIn(o, {
      code,
      sessionDid: renown.did,
      ...(password === undefined ? {} : { password }),
    });
    if (!answer) {
      setLocalSignIn({ status: "failed", reason: "unreachable", dismiss });
      return;
    }
    if (answer.ok) return adopt(answer);
    if (
      answer.status === 423 ||
      (answer.reason === "wrong-password" && (answer.triesLeft ?? 0) > 0)
    ) {
      askPassword(answer.triesLeft, (next) => signIn(code, next));
      return;
    }
    setLocalSignIn({
      status: "failed",
      reason: answer.reason,
      ...(answer.label ? { label: answer.label } : {}),
      dismiss,
    });
  }

  async function drop(reason: string): Promise<void> {
    const user = renown.user;
    if (!user) return;
    logger.warn(
      "Dropping the sign-in of @address: @reason",
      user.address,
      reason,
    );
    await endSession(renown);
    if (user.localIdentity === "machine") {
      setLocalSignIn({ status: "ended", reason });
    }
  }

  async function renew(password?: string): Promise<void> {
    const user = renown.user;
    if (user?.localIdentity !== "machine") return;
    if (
      !credentialEndsWithin(user.credential, LOCAL_SIGN_IN_RENEW_DAYS, now())
    ) {
      return;
    }
    if (credentialEndsWithin(user.credential, 0, now())) {
      await drop("expired");
      return;
    }
    const bearer = await renown.getBearerToken({ expiresIn: 60 });
    const answer = await renewLocalSignIn(o, {
      bearer,
      ...(password === undefined ? {} : { password }),
    });
    // The server is not running: the credential holds until it ends.
    if (!answer) return;
    if (answer.ok) return adopt(answer);
    if (answer.status === 423 || answer.reason === "wrong-password") {
      askPassword(answer.triesLeft, (next) => renew(next));
      return;
    }
    if (answer.status === 401) await drop(answer.reason);
  }

  return {
    async start(fragment) {
      if (fragment?.kind === "sign-out") {
        await endSession(renown);
        setLocalSignIn(undefined);
      } else if (fragment?.kind === "sign-in") {
        await signIn(fragment.code);
      }
      const user = renown.user;
      if (user && credentialEndsWithin(user.credential, 0, now())) {
        await drop("expired");
      }
      // The credential still holds: a server slow to answer does not hold
      // the boot for long.
      const renewing = renew().catch((error: unknown) =>
        logger.warn("Could not renew the sign-in: @error", error),
      );
      await Promise.race([
        renewing,
        new Promise((resolve) => setTimeout(resolve, BOOT_RENEW_WAIT_MS)),
      ]);
      timer ??= setInterval(() => {
        void renew().catch((error: unknown) =>
          logger.warn("Could not renew the sign-in: @error", error),
        );
      }, o.renewEveryMs ?? RENEW_EVERY_MS);
    },
    renew: () => renew(),
    drop,
    stop() {
      clearInterval(timer);
      timer = undefined;
    },
  };
}
