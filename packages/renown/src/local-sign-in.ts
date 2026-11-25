import {
  credentialBindingOf,
  credentialRecordId,
  readCredentialRecord,
  readCredentialWithdrawal,
  writeCredentialRecord,
  type CredentialLike,
} from "@powerhousedao/shared/clis/credential-records";
import {
  IDENTITY_PASSWORD_ENV,
  PasswordRequiredError,
  pseudonymLabel,
  readActiveIdentity,
  WrongPasswordError,
} from "@powerhousedao/shared/clis/identity";
import {
  LOCAL_SIGN_IN_LABEL,
  LOCAL_SIGN_IN_RENEW_DAYS,
  type LocalSignInIssued,
  type LocalSignInIssuer,
  type LocalSignInRefusal,
  type LocalSignInSession,
} from "@powerhousedao/shared/clis/local-sign-in";
import {
  approvedSessionCredential,
  credentialEndsWithin,
  ensureSessionFile,
  readSessionFile,
  SESSION_LIFETIME_DAYS,
  sessionCredentialFor,
  sessionFilePath,
  sessionWithdrawn,
  writeSessionFile,
} from "@powerhousedao/shared/clis/sessions";
import { carriedCredentialOf } from "./carried-credential.js";
import { verifyCredentialSignature } from "./credential.js";
import { resolveActiveIdentity, type ActiveIdentity } from "./identity.js";
import type { PowerhouseVerifiableCredential } from "./types.js";
import { verifyAuthBearerToken } from "./utils.js";

/**
 * The issuing side of sign-in by link (F3d), for the process that serves
 * Connect on this computer: credentials signed by the person's pseudonym for
 * a page's session key, and for the data-folder sessions the host declares
 * (the Studio agent), with their records in the store's data folder. The key
 * is unlocked once, with the password the page sends, and kept in this
 * process's memory only.
 */

type Env = Readonly<Record<string, string | undefined>>;

/** Declared sessions are renewed this long before their end: ahead of their
 * own renewal, which a locked key cannot make. */
const SESSION_RENEW_AHEAD_DAYS = 14;

const DAY_MS = 86_400_000;
const SESSION_DID = /^did:key:z[1-9A-HJ-NP-Za-km-z]{20,}$/;

function refuse(
  status: LocalSignInRefusal["status"],
  reason: LocalSignInRefusal["reason"],
  label?: string,
): LocalSignInRefusal {
  return { ok: false, status, reason, ...(label ? { label } : {}) };
}

const isRefusal = (value: unknown): value is LocalSignInRefusal =>
  typeof value === "object" &&
  value !== null &&
  (value as { ok?: unknown }).ok === false;

export function createLocalSignInIssuer(o: {
  /** The store's data folder: its pseudonym, sessions and records. */
  dataDir: string;
  /** Data-folder sessions this host issues for (labels). */
  sessions?: readonly string[];
  env?: Env;
  now?: () => number;
}): LocalSignInIssuer {
  const env = o.env ?? process.env;
  const now = o.now ?? Date.now;
  const declared = new Set(o.sessions ?? []);
  let unlocked: ActiveIdentity | undefined;
  // One unlock at a time: scrypt is costly, and two would race the cache.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  /** Runs `use` as the unlocked pseudonym, unlocking it with `password`. */
  async function asPseudonym<T>(
    password: string | undefined,
    use: (identity: ActiveIdentity) => Promise<T>,
  ): Promise<T | LocalSignInRefusal> {
    const info = readActiveIdentity({ dataDir: o.dataDir, env });
    if (info?.kind === "renown") {
      unlocked = undefined;
      return refuse(409, "renown-login", info.label);
    }
    if (unlocked && info && unlocked.address !== info.address) {
      unlocked = undefined;
    }
    let identity = unlocked;
    if (!identity) {
      if (
        info?.encrypted &&
        password === undefined &&
        env[IDENTITY_PASSWORD_ENV] === undefined
      ) {
        return refuse(423, "password-required");
      }
      // Nobody logged in and no pseudonym yet: it is made now (D2).
      const resolved = await resolveActiveIdentity({
        dataDir: o.dataDir,
        interactive: false,
        create: true,
        env,
        ...(password === undefined ? {} : { password }),
      });
      if (!resolved || resolved.kind !== "pseudonym") {
        return refuse(409, "renown-login", resolved?.label);
      }
      identity = resolved;
    }
    try {
      const result = await use(identity);
      unlocked = identity;
      return result;
    } catch (error) {
      if (error instanceof WrongPasswordError) {
        return refuse(401, "wrong-password");
      }
      if (error instanceof PasswordRequiredError) {
        return refuse(423, "password-required");
      }
      throw error;
    }
  }

  /** The declared session `label`'s credential, issued when it needs one. */
  async function issueSession(
    identity: ActiveIdentity,
    label: string,
  ): Promise<LocalSignInSession | undefined> {
    const file = sessionFilePath({
      place: "data-folder",
      label,
      address: "",
      dataDir: o.dataDir,
      env,
    });
    const session = ensureSessionFile(file, label);
    // A wallet approved it: it signs as that wallet, not the pseudonym.
    if (approvedSessionCredential(session, { dataDir: o.dataDir, env })) {
      return undefined;
    }
    const held = sessionCredentialFor(session, identity.address, now());
    if (held && sessionWithdrawn({ dataDir: o.dataDir, session })) {
      return { label, withdrawn: true };
    }
    if (held && !credentialEndsWithin(held, SESSION_RENEW_AHEAD_DAYS, now())) {
      return {
        label,
        ...(held.expirationDate ? { expiresAt: held.expirationDate } : {}),
      };
    }
    const credential = await identity.issueSessionCredential!(session.did, {
      label,
      expiresInDays: SESSION_LIFETIME_DAYS,
    });
    writeSessionFile(file, {
      ...(readSessionFile(file) ?? session),
      credential: credential as CredentialLike,
    });
    writeCredentialRecord({
      dataDir: o.dataDir,
      credential: credential as CredentialLike,
      source: "cli",
      writtenBy: label,
    });
    return { label, expiresAt: credential.expirationDate! };
  }

  async function declaredSessions(
    identity: ActiveIdentity,
    labels: Iterable<string>,
  ): Promise<LocalSignInSession[]> {
    const issued: LocalSignInSession[] = [];
    for (const label of labels) {
      const session = await issueSession(identity, label);
      if (session) issued.push(session);
    }
    return issued;
  }

  /** A credential for the page's `sessionDid`, recorded in the store. */
  async function issuePage(
    identity: ActiveIdentity,
    sessionDid: string,
  ): Promise<LocalSignInIssued> {
    const credential = await identity.issueSessionCredential!(sessionDid, {
      label: LOCAL_SIGN_IN_LABEL,
      expiresInDays: SESSION_LIFETIME_DAYS,
    });
    writeCredentialRecord({
      dataDir: o.dataDir,
      credential: credential as CredentialLike,
      source: "browser",
      writtenBy: "connect sign-in",
    });
    // Unlocked with a password: the sessions that cannot ask for one get
    // theirs now. A plain key leaves them to issue their own.
    const sessions = identity.encrypted
      ? await declaredSessions(identity, declared)
      : [];
    const expiresAt = credential.expirationDate!;
    return {
      ok: true,
      credential,
      identity: {
        kind: "pseudonym",
        address: identity.address,
        label: pseudonymLabel(identity.address),
      },
      expiresAt,
      renewFrom: new Date(
        Date.parse(expiresAt) - LOCAL_SIGN_IN_RENEW_DAYS * DAY_MS,
      ).toISOString(),
      sessions,
    };
  }

  /** The page session a bearer is of, when its credential was issued here. */
  async function pageOf(
    bearer: string,
  ): Promise<{ sessionDid: string } | LocalSignInRefusal> {
    const verified = await verifyAuthBearerToken(bearer).catch(
      () => false as const,
    );
    if (!verified) return refuse(401, "bad-bearer");
    // The bearer's signer: the page's session key.
    const { issuer } = verified as { issuer?: unknown };
    if (typeof issuer !== "string") return refuse(401, "bad-bearer");
    const sessionDid = issuer;
    const carried: PowerhouseVerifiableCredential | undefined =
      carriedCredentialOf(verified);
    const binding = carried && credentialBindingOf(carried as CredentialLike);
    const info = readActiveIdentity({ dataDir: o.dataDir, env });
    if (info?.kind === "renown") return refuse(409, "renown-login", info.label);
    if (
      !carried ||
      !binding ||
      binding.sessionDid !== sessionDid ||
      carried.credentialSubject.app !== LOCAL_SIGN_IN_LABEL ||
      !info ||
      binding.address !== info.address.toLowerCase() ||
      !(await verifyCredentialSignature(carried).catch(() => false))
    ) {
      return refuse(401, "not-issued-here");
    }
    const id = credentialRecordId(binding);
    if (!readCredentialRecord({ dataDir: o.dataDir, id })) {
      return readCredentialWithdrawal({ dataDir: o.dataDir, id })
        ? refuse(401, "withdrawn")
        : refuse(401, "not-issued-here");
    }
    if (credentialEndsWithin(carried as CredentialLike, 0, now())) {
      return refuse(401, "expired");
    }
    return { sessionDid };
  }

  return {
    signIn: ({ sessionDid, password }) =>
      serial(async () => {
        if (!SESSION_DID.test(sessionDid)) return refuse(400, "bad-session");
        return asPseudonym(password, (identity) =>
          issuePage(identity, sessionDid),
        );
      }),

    renew: ({ bearer, password }) =>
      serial(async () => {
        const page = await pageOf(bearer);
        if (isRefusal(page)) return page;
        return asPseudonym(password, (identity) =>
          issuePage(identity, page.sessionDid),
        );
      }),

    unlock: ({ bearer, password, sessions }) =>
      serial(async () => {
        if (sessions.some((label) => !declared.has(label))) {
          return refuse(403, "undeclared-session");
        }
        const page = await pageOf(bearer);
        if (isRefusal(page)) return page;
        const result = await asPseudonym(password, async (identity) => ({
          ok: true as const,
          sessions: await declaredSessions(identity, sessions),
        }));
        return result;
      }),

    renewSessions: () =>
      serial(async () => {
        const identity = unlocked;
        // A plain key: the sessions renew their own. Locked: nothing to do.
        if (!identity?.encrypted || declared.size === 0) return [];
        const info = readActiveIdentity({ dataDir: o.dataDir, env });
        if (info?.kind !== "pseudonym" || info.address !== identity.address) {
          return [];
        }
        return declaredSessions(identity, declared);
      }),
  };
}
