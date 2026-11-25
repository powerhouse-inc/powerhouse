import type { PrivateKeyAccount } from "viem/accounts";
import { DEFAULT_RENOWN_CHAIN_ID } from "./constants.js";
import {
  buildAndSignCredential,
  type SignCredentialTypedData,
} from "./credential.js";
import { enrolCredential } from "./credential-enrolment.js";
import type { PowerhouseVerifiableCredential } from "./types.js";

/**
 * Hosted Connect without a login (F3d): this browser's own pseudonym, an
 * Ethereum key kept in IndexedDB beside the session key, in the form `ph`
 * keeps a pseudonym in (`format: "ph-pseudonym"`), so a later export writes
 * the file `ph` reads. It signs a credential for the tab's session key, which
 * the switchboards the tab writes to keep a record of when asked by a request
 * the pseudonym signs. Lost with the site's data.
 */

type Hex = `0x${string}`;

/** As `ph` keeps a pseudonym without a password. */
export type BrowserPseudonymFile = {
  format: "ph-pseudonym";
  version: 1;
  address: Hex;
  createdAt: string;
  key: { type: "plain"; privateKey: Hex };
};

/** Where the pseudonym is kept: `BrowserKeyStorage` in a browser. */
export interface PseudonymStore {
  loadPseudonym(): Promise<unknown>;
  /** Keeps `file` unless one is kept; answers the one kept. */
  addPseudonym(file: BrowserPseudonymFile): Promise<unknown>;
}

export type BrowserPseudonym = {
  address: Hex;
  /** "Anonymous 0x1a2b...9f3c". */
  label: string;
  file: BrowserPseudonymFile;
  signTypedData: SignCredentialTypedData;
};

/** The label credentials for the tab's session carry: Connect's app name. */
export const BROWSER_PSEUDONYM_LABEL = "connect";

/** How long a credential the pseudonym signs holds. */
export const BROWSER_CREDENTIAL_DAYS = 30;

/** "Anonymous 0x1a2b...9f3c", as `ph whoami` names a pseudonym. */
export function anonymousLabel(address: string): string {
  return `Anonymous ${address.slice(0, 6)}...${address.slice(-4)}`;
}

const HEX_KEY = /^0x[0-9a-fA-F]{64}$/;
const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** `value` as a pseudonym file this browser can sign with, if it is one. */
export function parseBrowserPseudonym(
  value: unknown,
): BrowserPseudonymFile | undefined {
  const file = value as Partial<BrowserPseudonymFile> | undefined;
  if (
    file?.format !== "ph-pseudonym" ||
    file.version !== 1 ||
    typeof file.address !== "string" ||
    !HEX_ADDRESS.test(file.address) ||
    file.key?.type !== "plain" ||
    typeof file.key.privateKey !== "string" ||
    !HEX_KEY.test(file.key.privateKey)
  ) {
    return undefined;
  }
  return file as BrowserPseudonymFile;
}

async function accountOf(file: BrowserPseudonymFile) {
  const { privateKeyToAccount } = await import("viem/accounts");
  return privateKeyToAccount(file.key.privateKey);
}

function pseudonymOf(
  file: BrowserPseudonymFile,
  account: PrivateKeyAccount,
): BrowserPseudonym {
  return {
    address: account.address,
    label: anonymousLabel(account.address),
    file,
    signTypedData: (args) =>
      account.signTypedData(
        args as Parameters<PrivateKeyAccount["signTypedData"]>[0],
      ),
  };
}

/** The pseudonym this browser keeps, if any. */
export async function readBrowserPseudonym(
  store: PseudonymStore,
): Promise<BrowserPseudonym | undefined> {
  const file = parseBrowserPseudonym(await store.loadPseudonym());
  return file && pseudonymOf(file, await accountOf(file));
}

/** The pseudonym this browser keeps, made now when it has none. */
export async function ensureBrowserPseudonym(
  store: PseudonymStore,
  now: () => number = Date.now,
): Promise<BrowserPseudonym> {
  const kept = await readBrowserPseudonym(store);
  if (kept) return kept;
  const { generatePrivateKey, privateKeyToAccount } =
    await import("viem/accounts");
  const privateKey = generatePrivateKey();
  const made: BrowserPseudonymFile = {
    format: "ph-pseudonym",
    version: 1,
    address: privateKeyToAccount(privateKey).address,
    createdAt: new Date(now()).toISOString(),
    key: { type: "plain", privateKey },
  };
  // Another tab may have made one first: the kept one wins.
  const file = parseBrowserPseudonym(await store.addPseudonym(made));
  if (!file) throw new Error("This browser keeps an unreadable pseudonym.");
  return pseudonymOf(file, await accountOf(file));
}

/** A credential, signed by the pseudonym, naming the tab's session key. */
export function issueBrowserCredential(
  pseudonym: BrowserPseudonym,
  o: {
    sessionDid: string;
    chainId?: number;
    label?: string;
    expiresInDays?: number;
  },
): Promise<PowerhouseVerifiableCredential> {
  return buildAndSignCredential({
    signTypedData: pseudonym.signTypedData,
    address: pseudonym.address,
    chainId: o.chainId ?? Number(DEFAULT_RENOWN_CHAIN_ID),
    app: o.label ?? BROWSER_PSEUDONYM_LABEL,
    appId: o.sessionDid,
    expiresInDays: o.expiresInDays ?? BROWSER_CREDENTIAL_DAYS,
  });
}

export type EnrolmentOutcome =
  | { host: string; ok: true }
  | { host: string; ok: false; error: string };

/**
 * Asks each switchboard at `hosts` (their base URLs) to keep a record of
 * `credential`, by a request the pseudonym signs. One that cannot be reached
 * is reported, not thrown: its next refusal (`not-registered`) asks again.
 */
export async function enrolBrowserCredential(o: {
  pseudonym: BrowserPseudonym;
  credential: PowerhouseVerifiableCredential;
  hosts: readonly string[];
  fetch?: typeof globalThis.fetch;
}): Promise<EnrolmentOutcome[]> {
  const hosts = [...new Set(o.hosts)];
  return Promise.all(
    hosts.map(async (host): Promise<EnrolmentOutcome> => {
      try {
        await enrolCredential({
          hostUrl: host,
          credential: o.credential,
          signTypedData: o.pseudonym.signTypedData,
          ...(o.fetch ? { fetch: o.fetch } : {}),
        });
        return { host, ok: true };
      } catch (error) {
        return {
          host,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}
