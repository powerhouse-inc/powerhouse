import {
  OPERATOR_ENV,
  OS_USER_OPERATOR,
} from "@powerhousedao/shared/clis/constants";
import {
  readActiveIdentity,
  readPseudonym,
} from "@powerhousedao/shared/clis/identity";

/**
 * Who operates this instance besides `ADMINS`, as its launcher said
 * (`PH_OPERATOR`): the OS user that runs it (`osUser`), and explicit
 * addresses.
 */
export type OperatorSource = {
  osUser: boolean;
  addresses: string[];
};

/**
 * `PH_OPERATOR` read: `os-user`, addresses, or both, comma separated.
 * Unset or empty: no launcher said, so only `ADMINS` operate.
 */
export function parseOperatorSource(
  value: string | undefined,
): OperatorSource | undefined {
  const entries = (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== "");
  if (entries.length === 0) return undefined;
  const addresses = entries.filter((entry) => entry !== OS_USER_OPERATOR);
  for (const address of addresses) {
    if (!/^0x[0-9a-f]{40}$/.test(address)) {
      throw new Error(
        `${OPERATOR_ENV}: "${address}" is neither "${OS_USER_OPERATOR}" nor an Ethereum address`,
      );
    }
  }
  return {
    osUser: entries.includes(OS_USER_OPERATOR),
    addresses,
  };
}

type Env = Readonly<Record<string, string | undefined>>;

/** How long an OS user's identities are kept before they are read again. */
const OS_USER_REREAD_MS = 1000;

/**
 * Who administers this instance over HTTP: `ADMINS` plus what its launcher
 * passed. For the OS user that is their active identity (their Renown login,
 * else their pseudonym) and the store's pseudonym, read again at most once a
 * second, so a pseudonym made after boot, or a later `ph login`, counts at
 * once. Addresses compare lowercased.
 */
export class OperatorSet {
  readonly #admins: readonly string[];
  readonly #source: OperatorSource | undefined;
  readonly #dataDir: string | undefined;
  readonly #env: Env;
  #osUser: { at: number; addresses: string[] } | undefined;

  constructor(o: {
    admins: readonly string[];
    source?: OperatorSource;
    /** The store's data folder, where its pseudonym is. */
    dataDir?: string;
    env?: Env;
  }) {
    this.#admins = o.admins.map((admin) => admin.toLowerCase());
    this.#source = o.source;
    this.#dataDir = o.dataDir;
    this.#env = o.env ?? process.env;
  }

  /** Whether `address` operates this instance. */
  has(address: string | undefined): boolean {
    if (!address) return false;
    const lower = address.toLowerCase();
    if (this.#admins.includes(lower)) return true;
    if (!this.#source) return false;
    if (this.#source.addresses.includes(lower)) return true;
    return this.#source.osUser && this.#osUserAddresses().includes(lower);
  }

  /** Whether anyone is named: `ADMINS` or a launcher. */
  get configured(): boolean {
    return (
      this.#admins.length > 0 ||
      (this.#source !== undefined &&
        (this.#source.osUser || this.#source.addresses.length > 0))
    );
  }

  /** Who operates, as a boot line says it. */
  describe(): string {
    const parts: string[] = [];
    if (this.#admins.length > 0) parts.push(`ADMINS (${this.#admins.length})`);
    if (this.#source?.osUser) parts.push("the OS user running it");
    if (this.#source && this.#source.addresses.length > 0) {
      parts.push(this.#source.addresses.join(", "));
    }
    return parts.length > 0 ? parts.join(", ") : "nobody";
  }

  #osUserAddresses(): string[] {
    const now = Date.now();
    if (this.#osUser && now - this.#osUser.at < OS_USER_REREAD_MS) {
      return this.#osUser.addresses;
    }
    const addresses = new Set<string>();
    if (this.#dataDir) {
      for (const read of [readActiveIdentity, readPseudonym]) {
        try {
          const address = read({
            dataDir: this.#dataDir,
            env: this.#env,
          })?.address;
          if (address) addresses.add(address.toLowerCase());
        } catch {
          // An unreadable identity names nobody.
        }
      }
    }
    this.#osUser = { at: now, addresses: [...addresses] };
    return this.#osUser.addresses;
  }
}
