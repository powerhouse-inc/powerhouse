import {
  ensurePseudonym,
  type IdentityInfo,
  loginPaths,
  PasswordRequiredError,
  readActiveIdentity,
  readLogin,
  readLoginFile,
  readPseudonym,
  unlockPseudonym,
} from "@powerhousedao/shared/clis/identity";
import fs from "node:fs";
import type { Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { DEFAULT_RENOWN_CHAIN_ID, DEFAULT_RENOWN_URL } from "./constants.js";
import {
  buildAndSignCredential,
  fetchDelegationCredential,
  type SignCredentialTypedData,
} from "./credential.js";
import {
  CredentialWithdrawnError,
  readCredentialRecord,
  credentialRecordId,
  writeCredentialRecord,
  type CredentialLike,
} from "@powerhousedao/shared/clis/credential-records";
import {
  approvedSessionCredential,
  credentialEndsWithin,
  ensureSessionFile,
  readSessionFile,
  SESSION_LIFETIME_DAYS,
  SESSION_RENEW_DAYS,
  sessionCredentialFor,
  sessionFilePath,
  sessionSignerOf,
  writeSessionFile,
  type SessionPlace,
  type SessionSigner,
} from "@powerhousedao/shared/clis/sessions";
import { randomUUID } from "node:crypto";
import type { ISigner } from "@powerhousedao/shared/document-model";
import { enrolCredential } from "./credential-enrolment.js";
import { MemoryKeyStorage } from "./crypto/memory-key-storage.js";
import { NodeKeyStorage } from "./crypto/node-key-storage.js";
import type { RenownCrypto } from "./crypto/renown-crypto.js";
import { RenownCryptoBuilder } from "./crypto/renown-crypto-builder.js";
import { RenownCryptoSigner } from "./crypto/signer.js";
import type { JwkKeyPair } from "./crypto/types.js";
import { resolveSwitchboardEndpoint } from "./discovery.js";
import { RenownBuilder } from "./init.node.js";
import { SwitchboardClient } from "./switchboard.js";
import type { IRenown, PowerhouseVerifiableCredential, User } from "./types.js";

/**
 * The signing side of the person's identities (node). Reading who is active
 * is `@powerhousedao/shared/clis/identity`, which loads none of this.
 */

type Env = Readonly<Record<string, string | undefined>>;

export { identityHome, loginPaths } from "@powerhousedao/shared/clis/identity";

export class LoginExpiredError extends Error {
  constructor(label: string, expiresAt?: string) {
    super(
      `The Renown login of ${label} expired${expiresAt ? ` on ${expiresAt}` : ""}. Run \`ph login\` again, or \`ph logout\` to act as your pseudonym.`,
    );
    this.name = "LoginExpiredError";
  }
}

/**
 * The Renown login in the home folder: `ph login` writes it, every project
 * reads it. Its session key is the file's only: PH_RENOWN_PRIVATE_KEY names an
 * instance's key, never the login's.
 */
export function homeLoginRenown(
  opts: {
    appName?: string;
    baseUrl?: string;
    switchboardUrl?: string;
    revalidate?: "always" | "never";
    env?: Env;
  } = {},
): Promise<IRenown> {
  return loginRenownAt(loginPaths(opts.env), opts);
}

/**
 * Where a Renown login is kept: its `.renown.json` and the session key whose
 * bearer acts for it. The home folder's (`loginPaths`), or one a project
 * (`.ph/`) or Studio's agent (`.ph/vetra/agent/`) kept before Powerhouse 6.4.
 */
export type LoginFiles = { file: string; keypair: string };

/** The Renown of the login kept in `files`; its key is the file's only. */
function loginRenownAt(
  files: LoginFiles,
  opts: {
    appName?: string;
    baseUrl?: string;
    switchboardUrl?: string;
    revalidate?: "always" | "never";
  },
): Promise<IRenown> {
  return new RenownBuilder(opts.appName ?? "ph-cli", {
    keyPath: files.keypair,
    keyEnv: null,
    storagePath: files.file,
    ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
    ...(opts.switchboardUrl ? { switchboardUrl: opts.switchboardUrl } : {}),
    revalidate: opts.revalidate ?? "always",
  }).build();
}

export interface HomeLogin {
  /** The session key's did:key. */
  did: string;
  keyPair: JwkKeyPair;
  user: User;
}

/**
 * The home folder's login with its session key, read from the files only:
 * no key is made and nothing is asked of Renown.
 */
export async function readHomeLogin(
  env: Env = process.env,
): Promise<HomeLogin | undefined> {
  const login = readLogin(env);
  if (!login || login.expired) return undefined;
  const paths = loginPaths(env);
  if (!fs.existsSync(paths.keypair)) return undefined;
  const keyPair = await new NodeKeyStorage(paths.keypair, {
    envKeyName: null,
  }).loadKeyPair();
  if (!keyPair) return undefined;
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage(keyPair))
    .build();
  const user = (
    JSON.parse(fs.readFileSync(paths.file, "utf8")) as { user: User }
  ).user;
  return { did: crypto.did, keyPair, user };
}

export type ActiveIdentity = IdentityInfo & {
  /** EIP-712 as the pseudonym's address. Unset for a Renown login: the wallet is elsewhere. */
  signTypedData?: SignCredentialTypedData;
  /** `personal_sign` as the pseudonym's address. */
  signMessage?: (message: string) => Promise<Hex>;
  /**
   * A credential, signed by the pseudonym, that names `sessionDid` and
   * labels it (`credentialSubject.app`).
   */
  issueSessionCredential?: (
    sessionDid: string,
    opts: { label: string; chainId?: number; expiresInDays?: number },
  ) => Promise<PowerhouseVerifiableCredential>;
  /** The Renown login, for its bearers and signer; refuses an expired one. */
  loginRenown?: (opts?: {
    appName?: string;
    baseUrl?: string;
  }) => Promise<IRenown>;
};

/**
 * Who acts in `dataDir` and how it signs: the Renown login when there is one,
 * else the pseudonym (made when `create` and there is none). A pseudonym's key
 * is unlocked once, at the first signature, asking its password when
 * `interactive`.
 */
export async function resolveActiveIdentity(opts: {
  dataDir: string;
  interactive: boolean;
  create?: boolean;
  password?: string;
  env?: Env;
}): Promise<ActiveIdentity | undefined> {
  const env = opts.env ?? process.env;
  const active = readActiveIdentity({ dataDir: opts.dataDir, env });
  if (active?.kind === "renown") {
    const login = active.renown!;
    return {
      ...active,
      loginRenown: (o = {}) => {
        if (readLogin(env)?.expired ?? login.expired) {
          return Promise.reject(
            new LoginExpiredError(login.label, login.expiresAt),
          );
        }
        return homeLoginRenown({ ...o, env, revalidate: "never" });
      },
    };
  }
  const info = opts.create
    ? await ensurePseudonym({ dataDir: opts.dataDir, env })
    : (active ?? readPseudonym({ dataDir: opts.dataDir, env }));
  if (!info) return undefined;

  let account: Promise<PrivateKeyAccount> | undefined;
  const accountOf = () =>
    (account ??= (async () => {
      const key = await unlockPseudonym(info, {
        interactive: opts.interactive,
        env,
        ...(opts.password === undefined ? {} : { password: opts.password }),
      });
      const { privateKeyToAccount } = await import("viem/accounts");
      return privateKeyToAccount(`0x${Buffer.from(key).toString("hex")}`);
    })().catch((error: unknown) => {
      // A wrong password may be tried again.
      account = undefined;
      throw error;
    }));
  const signTypedData: SignCredentialTypedData = async (args) =>
    (await accountOf()).signTypedData(
      args as Parameters<PrivateKeyAccount["signTypedData"]>[0],
    );
  return {
    ...info,
    signTypedData,
    signMessage: async (message) =>
      (await accountOf()).signMessage({ message }),
    issueSessionCredential: (sessionDid, o) =>
      buildAndSignCredential({
        signTypedData,
        address: info.address,
        chainId: o.chainId ?? Number(DEFAULT_RENOWN_CHAIN_ID),
        app: o.label,
        appId: sessionDid,
        ...(o.expiresInDays === undefined
          ? {}
          : { expiresInDays: o.expiresInDays }),
      }),
  };
}

export type WithdrawResult =
  | { status: "withdrawn" }
  | { status: "not-logged-in" }
  /** Renown holds no such credential (any more). */
  | { status: "not-found" }
  /** Renown did not take the login's own bearer: the wallet must sign. */
  | { status: "refused"; reason: string; revokeUrl: string }
  /** Nothing could ask Renown: the login lapses at its expiry. */
  | { status: "unavailable"; reason: string; expiresAt?: string };

// How the switchboard words a refusal (FORBIDDEN, UNAUTHENTICATED, 401, 403).
const REFUSED =
  /forbidden|unauthenticated|unauthori[sz]ed|not authori[sz]ed|failed: 40[13]\b/i;
const NOT_FOUND = /not found/i;

/**
 * Withdraws the home login's credential at Renown with a bearer of the login's
 * own session key, as the Renown site does before it asks the wallet.
 */
export function withdrawLogin(
  opts: { renownUrl?: string; env?: Env } = {},
): Promise<WithdrawResult> {
  return withdrawLoginAt({
    files: loginPaths(opts.env ?? process.env),
    ...(opts.renownUrl ? { renownUrl: opts.renownUrl } : {}),
  });
}

/**
 * Withdraws, at Renown, the credential of the login kept in `files`, with a
 * bearer of that login's own session key: the home login (`ph logout`), and
 * the logins a project or Studio's agent kept before Powerhouse 6.4 (`ph
 * migrate`). A login whose key is gone cannot be withdrawn this way.
 */
export async function withdrawLoginAt(o: {
  files: LoginFiles;
  renownUrl?: string;
}): Promise<WithdrawResult> {
  const login = readLoginFile(o.files);
  if (!login) return { status: "not-logged-in" };
  const baseUrl = o.renownUrl ?? DEFAULT_RENOWN_URL;
  const revokeUrl = new URL("/me", baseUrl).href;
  const lapses = login.expiresAt ? { expiresAt: login.expiresAt } : {};
  if (!login.credentialId) {
    return {
      status: "unavailable",
      reason: "the stored login names no credential",
      ...lapses,
    };
  }
  if (login.expired) {
    return { status: "unavailable", reason: "it has expired", ...lapses };
  }
  // A missing key would be made anew, and no new key proves anything.
  if (!fs.existsSync(o.files.keypair)) {
    return {
      status: "unavailable",
      reason: `its session key ${o.files.keypair} is gone`,
      ...lapses,
    };
  }
  const endpoint = await resolveSwitchboardEndpoint({ baseUrl });
  if (!endpoint) {
    return {
      status: "unavailable",
      reason: `${baseUrl} offers no withdraw`,
      ...lapses,
    };
  }
  try {
    const renown = await loginRenownAt(o.files, {
      baseUrl,
      switchboardUrl: endpoint,
      revalidate: "never",
    });
    const token = await renown.getBearerToken({ expiresIn: 600 });
    await new SwitchboardClient(endpoint).revokeCredential(login.credentialId, {
      token,
    });
    return { status: "withdrawn" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (REFUSED.test(reason)) return { status: "refused", reason, revokeUrl };
    if (NOT_FOUND.test(reason)) return { status: "not-found" };
    return { status: "unavailable", reason, ...lapses };
  }
}

/**
 * `ph logout`: withdraws the login at Renown, then deletes it and its session
 * key, so a credential left at Renown names a key that no longer exists.
 */
export async function logoutHome(
  opts: { renownUrl?: string; env?: Env } = {},
): Promise<{ withdraw: WithdrawResult; removed: string[] }> {
  const withdraw = await withdrawLogin(opts);
  const paths = loginPaths(opts.env);
  const removed = [paths.file, paths.keypair].filter((file) =>
    fs.existsSync(file),
  );
  for (const file of removed) fs.rmSync(file, { force: true });
  return { withdraw, removed };
}

// ---------------------------------------------------------------- sessions

/** Where a session's credential must be known for a host to accept it. */
export type SessionTarget = {
  /** The store's data folder, when this process can write it. */
  dataDir?: string;
  /** The host's base URL, to enrol over HTTP when there is no folder. */
  url?: string;
};

/** No session for the label can sign yet: the person must approve one. */
export class SessionApprovalRequiredError extends Error {
  constructor(label: string, who?: string) {
    super(
      who
        ? `The session "${label}" of ${who} needs a credential that only their Renown wallet can sign; approve it first.`
        : `The session "${label}" signs only once a Renown wallet approves it.`,
    );
    this.name = "SessionApprovalRequiredError";
  }
}

/** The store withdrew the session's credential, and it is not issued again by itself. */
export class SessionWithdrawnError extends Error {
  constructor(
    label: string,
    readonly file: string,
  ) {
    super(
      `This store withdrew the session "${label}": it signs nothing there. Remove ${file} to let it act again with a new key.`,
    );
    this.name = "SessionWithdrawnError";
  }
}

export interface OpenSession {
  /** Who acts: the Renown login or the pseudonym. */
  identity: IdentityInfo;
  /** What actions' `context.signer` names. */
  signer: SessionSigner;
  /** Signs actions as the session; `app.name` is the credential's label. */
  actionSigner: ISigner;
  credential: PowerhouseVerifiableCredential;
  /** A bearer of the session that carries its credential (`phCredential`). */
  bearer(o?: { expiresIn?: number; aud?: string }): Promise<string>;
  /** Makes the credential known where `target` checks it. */
  enrol(target: SessionTarget): Promise<void>;
}

async function cryptoOf(keyPair: JwkKeyPair): Promise<RenownCrypto> {
  return new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage(keyPair))
    .build();
}

type SessionSource = {
  keyPair: JwkKeyPair;
  did: string;
  credential: PowerhouseVerifiableCredential;
  /** Issues the credential again (a pseudonym); unset for a Renown session. */
  reissue?: () => Promise<PowerhouseVerifiableCredential>;
};

/** The session a pseudonym signs with: its key file, its credential renewed. */
async function pseudonymSession(
  active: ActiveIdentity,
  o: { dataDir: string; label: string; place: SessionPlace; env: Env },
): Promise<SessionSource> {
  const file = sessionFilePath({
    place: o.place,
    label: o.label,
    address: active.address,
    dataDir: o.dataDir,
    env: o.env,
  });
  const session = ensureSessionFile(file, o.label);
  const issue = async () => {
    const credential = await active.issueSessionCredential!(session.did, {
      label: o.label,
      expiresInDays: SESSION_LIFETIME_DAYS,
    });
    writeSessionFile(file, {
      ...(readSessionFile(file) ?? session),
      credential: credential as CredentialLike,
    });
    return credential;
  };
  const held = sessionCredentialFor(session, active.address) as
    | PowerhouseVerifiableCredential
    | undefined;
  const credential =
    held && !credentialEndsWithin(held, SESSION_RENEW_DAYS)
      ? held
      : await issue().catch((error: unknown) => {
          // A locked key renews nothing; the held credential signs until it ends.
          if (held && error instanceof PasswordRequiredError) return held;
          throw error;
        });
  return {
    keyPair: session.key as JwkKeyPair,
    did: session.did,
    credential,
    reissue: issue,
  };
}

/** The session a Renown login signs with: the login's own, or an approved one. */
async function renownSession(
  active: ActiveIdentity,
  o: { dataDir: string; label: string; place: SessionPlace; env: Env },
): Promise<SessionSource> {
  const login = active.renown!;
  if (login.expired) throw new LoginExpiredError(login.label, login.expiresAt);
  if (o.place === "data-folder") {
    const session = readSessionFile(
      sessionFilePath({ ...o, address: active.address }),
    );
    const credential = session && sessionCredentialFor(session, active.address);
    if (!session || !credential) {
      throw new SessionApprovalRequiredError(o.label, login.label);
    }
    return {
      keyPair: session.key as JwkKeyPair,
      did: session.did,
      credential: credential as PowerhouseVerifiableCredential,
    };
  }
  const home = await readHomeLogin(o.env);
  if (!home?.user.credential) {
    throw new LoginExpiredError(login.label, login.expiresAt);
  }
  return {
    keyPair: home.keyPair,
    did: home.did,
    credential: home.user.credential,
  };
}

/** Writes `credential`'s record in `dataDir`, unless it holds it already. */
function recordIn(
  dataDir: string,
  credential: PowerhouseVerifiableCredential,
  writtenBy: string,
): void {
  const binding = {
    address: credential.issuer.ethereumAddress,
    chainId: Number(credential.issuer.id.split(":")[3]),
    sessionDid: credential.credentialSubject.id,
  };
  const held = readCredentialRecord({
    dataDir,
    id: credentialRecordId(binding),
  });
  if (held?.credential.id === credential.id) return;
  writeCredentialRecord({
    dataDir,
    credential: credential as CredentialLike,
    source: "cli",
    writtenBy,
  });
}

/** A data-folder session a Renown wallet approved: it signs as that wallet. */
function approvedSession(where: {
  dataDir: string;
  label: string;
  env: Env;
}): { identity: ActiveIdentity; source: SessionSource } | undefined {
  const file = sessionFilePath({
    place: "data-folder",
    label: where.label,
    address: "",
    dataDir: where.dataDir,
    env: where.env,
  });
  const session = readSessionFile(file);
  const credential =
    session &&
    approvedSessionCredential(session, {
      dataDir: where.dataDir,
      env: where.env,
    });
  if (!session || !credential) return undefined;
  const address = credential.issuer.ethereumAddress as `0x${string}`;
  return {
    identity: {
      kind: "renown",
      address,
      label: `${address.slice(0, 6)}...${address.slice(-4)}`,
      source: "data-folder",
      file,
    },
    source: {
      keyPair: session.key as JwkKeyPair,
      did: session.did,
      credential: credential as PowerhouseVerifiableCredential,
    },
  };
}

/**
 * The session `label` of whoever acts in `dataDir`, ready to sign: a
 * data-folder session a Renown wallet approved signs as that wallet; else a
 * pseudonym (made when there is none) signs its session's credential itself
 * and renews it when it has less than {@link SESSION_RENEW_DAYS} left; a
 * Renown login's `home` session is the login's own, a `data-folder` one must
 * have been approved ({@link SessionApprovalRequiredError}). A pseudonym's
 * password is asked here, when `interactive`, and only to issue.
 *
 * With `target`, the credential is made known there before this resolves:
 * a record in its data folder, else (a pseudonym) an enrolment at its URL.
 * A credential the target's folder withdrew is issued again, unless
 * `reissueWithdrawn` is false ({@link SessionWithdrawnError}): a session that
 * acts by itself (an agent, an MCP client) stays withdrawn. `pseudonym: false`
 * refuses to sign as the pseudonym: only a Renown login or an approved
 * session signs.
 */
export async function openSession(o: {
  dataDir: string;
  label: string;
  place: SessionPlace;
  interactive: boolean;
  target?: SessionTarget;
  password?: string;
  pseudonym?: boolean;
  reissueWithdrawn?: boolean;
  env?: Env;
}): Promise<OpenSession> {
  const env = o.env ?? process.env;
  const where = { dataDir: o.dataDir, label: o.label, place: o.place, env };
  const approved =
    o.place === "data-folder" ? approvedSession(where) : undefined;
  let active: ActiveIdentity;
  let source: SessionSource;
  if (approved) {
    ({ identity: active, source } = approved);
  } else {
    if (
      o.pseudonym === false &&
      readActiveIdentity({ dataDir: o.dataDir, env })?.kind !== "renown"
    ) {
      throw new SessionApprovalRequiredError(o.label);
    }
    const resolved = await resolveActiveIdentity({
      dataDir: o.dataDir,
      interactive: o.interactive,
      create: true,
      env,
      ...(o.password === undefined ? {} : { password: o.password }),
    });
    if (!resolved) throw new Error(`No identity acts in ${o.dataDir}.`);
    active = resolved;
    source =
      active.kind === "renown"
        ? await renownSession(active, where)
        : await pseudonymSession(active, where);
  }
  let { credential } = source;
  const crypto = await cryptoOf(source.keyPair);
  if (crypto.did !== source.did) {
    throw new Error(`The session key of "${o.label}" does not match its did.`);
  }
  const chainId = approved
    ? Number(credential.issuer.id.split(":")[3])
    : active.kind === "renown"
      ? (active.renown?.chainId ?? Number(DEFAULT_RENOWN_CHAIN_ID))
      : Number(DEFAULT_RENOWN_CHAIN_ID);
  const signerOf = () =>
    sessionSignerOf(
      { address: active.address, chainId },
      {
        did: source.did,
        label: o.label,
        credential: credential as CredentialLike,
      },
    );
  const signer = signerOf();
  const actionSigner = new RenownCryptoSigner(crypto, signer.app.name, {
    ...signer.user,
  });

  const enrol = async (target: SessionTarget) => {
    if (target.dataDir) {
      try {
        recordIn(target.dataDir, credential, o.label);
      } catch (error) {
        // Withdrawn there before: only a credential issued since lifts it.
        if (!(error instanceof CredentialWithdrawnError)) throw error;
        if (o.reissueWithdrawn === false && o.place === "data-folder") {
          throw new SessionWithdrawnError(
            o.label,
            sessionFilePath({
              place: o.place,
              label: o.label,
              address: active.address,
              dataDir: o.dataDir,
              env,
            }),
          );
        }
        if (!source.reissue) throw error;
        credential = await source.reissue();
        recordIn(target.dataDir, credential, o.label);
      }
      return;
    }
    if (target.url && active.signTypedData) {
      await enrolCredential({
        hostUrl: target.url,
        credential,
        signTypedData: active.signTypedData,
      });
    }
  };
  if (o.target) await enrol(o.target);

  return {
    identity: active,
    get signer() {
      return signerOf();
    },
    actionSigner,
    get credential() {
      return credential;
    },
    bearer: (b = {}) =>
      crypto.getBearerToken(active.address, {
        expiresIn: b.expiresIn ?? 600,
        ...(b.aud ? { aud: b.aud } : {}),
        credential,
      }),
    enrol,
  };
}

// ------------------------------------------------- approval at the console

/** A console approval of a data-folder session, started and not yet ready. */
export interface SessionApproval {
  /** Renown's console page the person approves the session on. */
  url: string;
  /** The console session the page reports to. */
  sessionId: string;
  /** The session key's did:key, which the approved credential names. */
  sessionDid: string;
  /** The session's file: its key, and its credential once approved. */
  file: string;
}

/**
 * Renown's console page on which a person approves the session key `did`
 * with their wallet: the console session it reports to, the key, the label
 * the credential is to sign, and optionally the host that asks (an http(s)
 * origin) and how many days the credential is to run. A console that reads
 * fewer of these ignores the rest.
 */
export function consoleApprovalUrl(o: {
  sessionId: string;
  did: string;
  label: string;
  renownUrl?: string;
  host?: string;
  expiresInDays?: number;
}): string {
  const url = new URL("/console", o.renownUrl ?? DEFAULT_RENOWN_URL);
  url.searchParams.set("session", o.sessionId);
  url.searchParams.set("connect", o.did);
  url.searchParams.set("app", o.label);
  if (o.host !== undefined) url.searchParams.set("host", o.host);
  if (o.expiresInDays !== undefined) {
    url.searchParams.set("expiresInDays", String(o.expiresInDays));
  }
  return url.href;
}

/**
 * Starts the approval of the data-folder session `label` at Renown's console:
 * keeps its key (made when there is none) and builds the page the person
 * approves it on with their wallet. Nothing is asked of Renown yet. `host`
 * and `expiresInDays` are shown on the page, by a console that reads them.
 */
export function startSessionApproval(o: {
  dataDir: string;
  label: string;
  renownUrl?: string;
  host?: string;
  expiresInDays?: number;
  env?: Env;
}): SessionApproval {
  const file = sessionFilePath({
    place: "data-folder",
    label: o.label,
    address: "",
    dataDir: o.dataDir,
    env: o.env,
  });
  const session = ensureSessionFile(file, o.label);
  const sessionId = randomUUID();
  const url = consoleApprovalUrl({
    sessionId,
    did: session.did,
    label: o.label,
    ...(o.renownUrl !== undefined ? { renownUrl: o.renownUrl } : {}),
    ...(o.host !== undefined ? { host: o.host } : {}),
    ...(o.expiresInDays !== undefined
      ? { expiresInDays: o.expiresInDays }
      : {}),
  });
  return { url, sessionId, sessionDid: session.did, file };
}

export type SessionApprovalResult =
  | {
      status: "ready";
      address: string;
      credential: PowerhouseVerifiableCredential;
    }
  /** Not approved yet; ask again. */
  | { status: "pending" }
  /** Approved by a wallet `accept` turned down: nothing was kept. */
  | { status: "refused"; address: string };

/** What the console gave for a session key, kept nowhere. */
export type ConsoleCredentialResult =
  | {
      status: "ready";
      address: string;
      chainId: number;
      credential: PowerhouseVerifiableCredential;
    }
  /** Not approved yet; ask again. */
  | { status: "pending" }
  /** Approved by a wallet `accept` turned down; its credential was not fetched. */
  | { status: "refused"; address: string };

const APPROVAL_POLL_MS = 1000;

type ConsoleSession =
  | { status: "pending" }
  | { status: "ready"; address: string; chainId: number };

/**
 * Waits up to `timeoutMs` for the person to approve the key `sessionDid` at
 * Renown's console (console session `sessionId`), then fetches the
 * credential their wallet signed for it. Keeps nothing: the caller decides
 * what the credential is for. A wallet `accept` turns down is not fetched.
 */
export async function pollConsoleCredential(o: {
  sessionId: string;
  sessionDid: string;
  renownUrl?: string;
  timeoutMs: number;
  accept?: (address: string) => boolean;
  signal?: AbortSignal;
}): Promise<ConsoleCredentialResult> {
  const baseUrl = o.renownUrl ?? DEFAULT_RENOWN_URL;
  const sessionUrl = new URL(
    `/api/console/session/${encodeURIComponent(o.sessionId)}`,
    baseUrl,
  );
  const deadline = Date.now() + o.timeoutMs;
  for (;;) {
    o.signal?.throwIfAborted();
    let ready: Extract<ConsoleSession, { status: "ready" }> | undefined;
    try {
      const response = await fetch(sessionUrl, {
        ...(o.signal ? { signal: o.signal } : {}),
      });
      if (response.ok) {
        const answer = (await response.json()) as ConsoleSession;
        if (answer.status === "ready") ready = answer;
      }
    } catch (error) {
      if (o.signal?.aborted) throw error;
      // Renown unreachable for now: asked again until the deadline.
    }
    if (ready) {
      if (o.accept && !o.accept(ready.address)) {
        return { status: "refused", address: ready.address };
      }
      const credential = await fetchDelegationCredential({
        address: ready.address,
        chainId: ready.chainId,
        appDid: o.sessionDid,
        baseUrl,
      });
      if (credential) {
        return {
          status: "ready",
          address: ready.address,
          chainId: ready.chainId,
          credential,
        };
      }
    }
    if (Date.now() >= deadline) return { status: "pending" };
    await new Promise((resolve) => setTimeout(resolve, APPROVAL_POLL_MS));
  }
}

/**
 * Waits up to `timeoutMs` for the person to approve `approval` at Renown's
 * console, then fetches the credential their wallet signed for the session
 * key and keeps it in the session's file, and its record in `target`'s data
 * folder. A wallet `accept` turns down is not kept.
 */
export async function pollSessionApproval(o: {
  approval: Pick<SessionApproval, "sessionId" | "sessionDid" | "file">;
  renownUrl?: string;
  timeoutMs: number;
  target?: Pick<SessionTarget, "dataDir">;
  accept?: (address: string) => boolean;
  signal?: AbortSignal;
}): Promise<SessionApprovalResult> {
  const result = await pollConsoleCredential({
    sessionId: o.approval.sessionId,
    sessionDid: o.approval.sessionDid,
    timeoutMs: o.timeoutMs,
    ...(o.renownUrl !== undefined ? { renownUrl: o.renownUrl } : {}),
    ...(o.accept ? { accept: o.accept } : {}),
    ...(o.signal ? { signal: o.signal } : {}),
  });
  if (result.status !== "ready") return result;
  const { address, credential } = result;
  const session = readSessionFile(o.approval.file);
  if (!session || session.did !== o.approval.sessionDid) {
    throw new Error(
      `The session key in ${o.approval.file} changed while it was being approved.`,
    );
  }
  writeSessionFile(o.approval.file, {
    ...session,
    credential: credential as CredentialLike,
  });
  if (o.target?.dataDir) {
    recordIn(o.target.dataDir, credential, session.label);
  }
  return { status: "ready", address, credential };
}
