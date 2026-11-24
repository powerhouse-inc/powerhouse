import {
  ensurePseudonym,
  type IdentityInfo,
  loginPaths,
  readActiveIdentity,
  readLogin,
  readPseudonym,
  unlockPseudonym,
} from "@powerhousedao/shared/clis/identity";
import fs from "node:fs";
import type { Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { DEFAULT_RENOWN_CHAIN_ID, DEFAULT_RENOWN_URL } from "./constants.js";
import {
  buildAndSignCredential,
  type SignCredentialTypedData,
} from "./credential.js";
import { MemoryKeyStorage } from "./crypto/memory-key-storage.js";
import { NodeKeyStorage } from "./crypto/node-key-storage.js";
import { RenownCryptoBuilder } from "./crypto/renown-crypto-builder.js";
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

/** The Renown login in the home folder: `ph login` writes it, every project reads it. */
export function homeLoginRenown(
  opts: {
    appName?: string;
    baseUrl?: string;
    switchboardUrl?: string;
    revalidate?: "always" | "never";
    env?: Env;
  } = {},
): Promise<IRenown> {
  const paths = loginPaths(opts.env);
  return new RenownBuilder(opts.appName ?? "ph-cli", {
    keyPath: paths.keypair,
    storagePath: paths.file,
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
  if (!fs.existsSync(paths.keypair) && !process.env.PH_RENOWN_PRIVATE_KEY) {
    return undefined;
  }
  const keyPair = await new NodeKeyStorage(paths.keypair).loadKeyPair();
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
export async function withdrawLogin(
  opts: { renownUrl?: string; env?: Env } = {},
): Promise<WithdrawResult> {
  const env = opts.env ?? process.env;
  const login = readLogin(env);
  if (!login) return { status: "not-logged-in" };
  const baseUrl = opts.renownUrl ?? DEFAULT_RENOWN_URL;
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
  const endpoint = await resolveSwitchboardEndpoint({ baseUrl });
  if (!endpoint) {
    return {
      status: "unavailable",
      reason: `${baseUrl} offers no withdraw`,
      ...lapses,
    };
  }
  try {
    const renown = await homeLoginRenown({
      env,
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
