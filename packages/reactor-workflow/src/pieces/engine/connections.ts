// Resolves connection references into the auth value a piece reads from
// ctx.auth, shaped per Activepieces auth kind (powerhouse/connection state).

export type ConnectionAuthType =
  | "SECRET_TEXT"
  | "BASIC_AUTH"
  | "CUSTOM_AUTH"
  | "OAUTH2"
  | "OIDC"
  | "NONE";

export interface SecretProvider {
  get(ref: string): Promise<string>;
}

export class SecretNotFoundError extends Error {
  constructor(ref: string) {
    super(`No secret found for ref "${ref}"`);
    this.name = "SecretNotFoundError";
  }
}

export class EnvSecretProvider implements SecretProvider {
  get(ref: string): Promise<string> {
    const value = process.env[ref];
    if (value === undefined)
      return Promise.reject(new SecretNotFoundError(ref));
    return Promise.resolve(value);
  }
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

// Mirrors the powerhouse/connection document state the resolver consumes.
export interface ConnectionSource {
  authType: ConnectionAuthType;
  config?: Record<string, unknown>;
  secretRefs?: { name: string; ref: string }[];
}

export interface EngineConnectionResolver {
  resolve(connectionId: string): Promise<unknown>;
}

export class ConnectionNotFoundError extends Error {
  constructor(connectionId: string) {
    super(`No connection registered for id "${connectionId}"`);
    this.name = "ConnectionNotFoundError";
  }
}

export class UnsupportedAuthTypeError extends Error {
  constructor(authType: string) {
    super(`Auth type "${authType}" is not supported yet`);
    this.name = "UnsupportedAuthTypeError";
  }
}

async function resolveSecrets(
  source: ConnectionSource,
  secrets: SecretProvider,
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    (source.secretRefs ?? []).map(
      async ({ name, ref }) => [name, await secrets.get(ref)] as const,
    ),
  );
  return Object.fromEntries(entries);
}

// Values are AppConnectionValue-shaped: pieces read auth.secret_text,
// auth.username/password or auth.props.* depending on their auth kind.
export async function shapeAuthValue(
  source: ConnectionSource,
  secrets: SecretProvider,
): Promise<unknown> {
  switch (source.authType) {
    case "NONE":
      return undefined;
    case "SECRET_TEXT": {
      const resolved = await resolveSecrets(source, secrets);
      const values = Object.values(resolved);
      if (values.length !== 1) {
        throw new Error(
          `SECRET_TEXT connection must have exactly one secret ref, got ${values.length}`,
        );
      }
      return { type: "SECRET_TEXT", secret_text: values[0] };
    }
    case "BASIC_AUTH": {
      const props = {
        ...source.config,
        ...(await resolveSecrets(source, secrets)),
      };
      return {
        type: "BASIC_AUTH",
        username: props.username,
        password: props.password,
      };
    }
    case "CUSTOM_AUTH": {
      const props = {
        ...source.config,
        ...(await resolveSecrets(source, secrets)),
      };
      return { type: "CUSTOM_AUTH", props };
    }
    default:
      throw new UnsupportedAuthTypeError(source.authType);
  }
}

export class StaticConnectionResolver implements EngineConnectionResolver {
  private readonly connections: Map<string, ConnectionSource>;

  constructor(
    connections: Record<string, ConnectionSource>,
    private readonly secrets: SecretProvider = new EnvSecretProvider(),
  ) {
    this.connections = new Map(Object.entries(connections));
  }

  resolve(connectionId: string): Promise<unknown> {
    const source = this.connections.get(connectionId);
    if (!source) {
      return Promise.reject(new ConnectionNotFoundError(connectionId));
    }
    return shapeAuthValue(source, this.secrets);
  }
}
