/**
 * Persistence contract for the registry's accounts + package ownership.
 *
 * The ownership claim is **atomic** (`claimOwner`): the first publisher of a
 * name wins even under a concurrent race, and everyone reads the same
 * resulting owner set. This is the property a flat file / plain object store
 * can't give and a relational DB can.
 */
export interface UserRecord {
  passwordHash: string;
}

export interface AuthStore {
  /** Create schema if needed. Safe to call repeatedly. */
  init(): Promise<void>;
  getUser(username: string): Promise<UserRecord | null>;
  /** Atomic create. Returns false if the username already exists. */
  createUser(username: string, passwordHash: string): Promise<boolean>;
  getOwners(pkg: string): Promise<string[] | null>;
  /** Owners for many names in one round-trip; names with no row are omitted. */
  getOwnersFor(pkgs: string[]): Promise<Record<string, string[]>>;
  /**
   * Atomically claim `pkg` for `username` if it has no owner, then return the
   * resulting owner list. If already owned, returns the existing owners
   * unchanged (so the caller checks membership to allow/deny).
   */
  claimOwner(pkg: string, username: string): Promise<string[]>;
  close(): Promise<void>;
}

/**
 * In-memory AuthStore for tests. JS is single-threaded so the map operations
 * model the atomicity the real (Postgres) store enforces with constraints.
 */
export function createMemoryAuthStore(): AuthStore {
  const users = new Map<string, UserRecord>();
  const owners = new Map<string, string[]>();
  return {
    init: () => Promise.resolve(),
    getUser: (u) => Promise.resolve(users.get(u) ?? null),
    createUser: (u, passwordHash) => {
      if (users.has(u)) return Promise.resolve(false);
      users.set(u, { passwordHash });
      return Promise.resolve(true);
    },
    getOwners: (pkg) => Promise.resolve(owners.get(pkg) ?? null),
    getOwnersFor: (pkgs) => {
      const out: Record<string, string[]> = {};
      for (const p of pkgs) {
        const o = owners.get(p);
        if (o) out[p] = o;
      }
      return Promise.resolve(out);
    },
    claimOwner: (pkg, username) => {
      const existing = owners.get(pkg);
      if (existing) return Promise.resolve(existing);
      const claimed = [username];
      owners.set(pkg, claimed);
      return Promise.resolve(claimed);
    },
    close: () => Promise.resolve(),
  };
}
