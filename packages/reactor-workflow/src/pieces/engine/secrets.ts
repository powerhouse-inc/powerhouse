// Secret references and the provider/store seams. Refs are server-minted
// random ids — stable handles over mutable values, never content hashes.

export const SECRET_REF_PREFIX = "secret://v1:";

const SECRET_ID_PATTERN = /^[0-9a-f]{32}$/;

// Read seam consumed by the engine (connection resolution).
export interface SecretProvider {
  get(ref: string): Promise<string>;
}

export interface SecretStat {
  ref: string;
  label: string | null;
  version: number;
  status: "ACTIVE" | "DELETED";
  createdAt: string;
  updatedAt: string;
}

// Full lifecycle, implemented by managed backends. `get` is execution-context
// only and must never be exposed over a transport.
export interface SecretStore extends SecretProvider {
  create(input: { value: string; label?: string }): Promise<SecretStat>;
  rotate(ref: string, value: string): Promise<SecretStat>;
  stat(ref: string): Promise<SecretStat>;
  list(): Promise<SecretStat[]>;
  delete(ref: string): Promise<void>;
}

export class SecretNotFoundError extends Error {
  constructor(ref: string) {
    super(`No secret found for ref "${ref}"`);
    this.name = "SecretNotFoundError";
  }
}

export class SecretDeletedError extends Error {
  constructor(ref: string) {
    super(`Secret "${ref}" has been deleted`);
    this.name = "SecretDeletedError";
  }
}

export class InvalidSecretRefError extends Error {
  constructor(ref: string) {
    super(
      `Invalid secret ref "${ref}"; expected ${SECRET_REF_PREFIX}<32 hex chars>`,
    );
    this.name = "InvalidSecretRefError";
  }
}

export function isSecretRef(ref: string): boolean {
  return (
    ref.startsWith(SECRET_REF_PREFIX) &&
    SECRET_ID_PATTERN.test(ref.slice(SECRET_REF_PREFIX.length))
  );
}

// Returns the 32-hex id; throws on anything else.
export function parseSecretRef(ref: string): string {
  if (!isSecretRef(ref)) throw new InvalidSecretRefError(ref);
  return ref.slice(SECRET_REF_PREFIX.length);
}

export function secretRefFromId(id: string): string {
  if (!SECRET_ID_PATTERN.test(id)) throw new InvalidSecretRefError(id);
  return `${SECRET_REF_PREFIX}${id}`;
}

export class InMemorySecretProvider implements SecretProvider {
  private readonly secrets: Map<string, string>;

  constructor(secrets: Record<string, string>) {
    this.secrets = new Map(Object.entries(secrets));
  }

  get(ref: string): Promise<string> {
    const value = this.secrets.get(ref);
    if (value === undefined)
      return Promise.reject(new SecretNotFoundError(ref));
    return Promise.resolve(value);
  }
}
