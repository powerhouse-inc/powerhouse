import {
  OPERATOR_ENV,
  OS_USER_OPERATOR,
} from "@powerhousedao/shared/clis/constants";
import {
  IDENTITY_KEY_ENV,
  readActiveIdentity,
  readLogin,
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
 * The boot line for `PH_IDENTITY_KEY` set beside a Renown login in the
 * identity home: the process acts as the key, not as the login, which still
 * administers where the launcher names the OS user. Undefined otherwise.
 */
export function identityKeyBesideLogin(
  env: Env = process.env,
): string | undefined {
  if (!env[IDENTITY_KEY_ENV]) return undefined;
  let login: ReturnType<typeof readLogin>;
  try {
    login = readLogin(env);
  } catch {
    return undefined;
  }
  if (!login) return undefined;
  return `${IDENTITY_KEY_ENV} is set while the Renown login of ${login.label} (${login.address}) is in the identity home: this process signs as the key in ${IDENTITY_KEY_ENV}, not as the login. Where the OS user administers the host (PH_OPERATOR=os-user), both do.`;
}

/**
 * Who administers this instance over HTTP: `ADMINS` plus what its launcher
 * passed. For the OS user that is their active identity (the key in
 * `PH_IDENTITY_KEY` when it is set, else their Renown login, else their
 * pseudonym), their Renown login whether or not the key is set (so a service
 * key in a project's `.env` takes no administration from the developer), and
 * the store's pseudonym. They are read again at most once a second, so a
 * pseudonym made after boot, or a later `ph login`, counts at once. An
 * identity that cannot be read (a malformed `PH_IDENTITY_KEY`) names nobody,
 * and is logged once. Addresses compare lowercased.
 */
export class OperatorSet {
  readonly #admins: readonly string[];
  readonly #source: OperatorSource | undefined;
  readonly #dataDir: string | undefined;
  readonly #env: Env;
  readonly #log: (message: string) => void;
  readonly #logged = new Set<string>();
  #osUser: { at: number; addresses: string[] } | undefined;

  constructor(o: {
    admins: readonly string[];
    source?: OperatorSource;
    /** The store's data folder, where its pseudonym is. */
    dataDir?: string;
    env?: Env;
    /** Told once per identity that cannot be read; `console.warn` by default. */
    log?: (message: string) => void;
  }) {
    this.#admins = o.admins.map((admin) => admin.toLowerCase());
    this.#source = o.source;
    this.#dataDir = o.dataDir;
    this.#env = o.env ?? process.env;
    this.#log = o.log ?? ((message) => console.warn(message));
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
    const add = (what: string, read: () => string | undefined) => {
      try {
        const address = read();
        if (address) addresses.add(address.toLowerCase());
      } catch (error) {
        // An unreadable identity names nobody; said once.
        const reason = error instanceof Error ? error.message : String(error);
        const message = `The OS user's ${what} cannot be read, so it administers nothing here: ${reason}`;
        if (!this.#logged.has(message)) {
          this.#logged.add(message);
          this.#log(message);
        }
      }
    };
    // Before PH_IDENTITY_KEY is read, so a malformed key leaves the login.
    add("Renown login", () => readLogin(this.#env)?.address);
    const dataDir = this.#dataDir;
    if (dataDir) {
      // Either read fails on the same thing: the key, or the pseudonym file.
      const what = this.#env[IDENTITY_KEY_ENV]
        ? `key in ${IDENTITY_KEY_ENV}`
        : `pseudonym of ${dataDir}`;
      add(what, () => readActiveIdentity({ dataDir, env: this.#env })?.address);
      add(what, () => readPseudonym({ dataDir, env: this.#env })?.address);
    }
    this.#osUser = { at: now, addresses: [...addresses] };
    return this.#osUser.addresses;
  }
}
