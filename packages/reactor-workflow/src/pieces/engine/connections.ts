// Resolves connection references into the auth value a piece reads from
// ctx.auth, shaped per Activepieces auth kind (powerhouse/connection state).

import type { SecretProvider } from "./secrets.js";
import type { WorkflowDefinition } from "./types.js";
import {
  AppConnectionType,
  type AppConnectionValue,
  type BasicAuthConnectionValue,
  type OAuth2ConnectionValueWithApp,
} from "@powerhousedao/pieces-framework";

// The powerhouse/connection document model's own enum: the framework's
// AppConnectionType, minus its hosted OAuth2 variants, with NO_AUTH as NONE.
export type ConnectionAuthType =
  | `${AppConnectionType.SECRET_TEXT}`
  | `${AppConnectionType.BASIC_AUTH}`
  | `${AppConnectionType.CUSTOM_AUTH}`
  | `${AppConnectionType.OAUTH2}`
  | `${AppConnectionType.OIDC}`
  | "NONE";

// Mirrors the powerhouse/connection document state the resolver consumes.
export interface ConnectionSource {
  authType: ConnectionAuthType;
  config?: Record<string, unknown>;
  secretRefs?: { name: string; ref: string }[];
}

// Which step is asking. A resolver needs it to check the request against the
// run's binding rather than trust the id it was handed.

// piecePackage is the piece the caller resolved the block to.
export interface ConnectionRequest {
  piecePackage?: string;
  stepId?: string;
  stepKey?: string;
}

// The auth a piece reads, plus the concrete secret strings behind it. The
// second half is what value-based journal redaction matches on.
export interface ResolvedConnection {
  auth: unknown;
  secretValues: string[];
}

export interface EngineConnectionResolver {
  resolve(connectionId: string, request?: ConnectionRequest): Promise<unknown>;
  // Optional: hosts that predate redaction keep working without it. It takes
  // the same request, so authorization is not skipped to get the secrets.
  resolveWithSecrets?(
    connectionId: string,
    request?: ConnectionRequest,
  ): Promise<ResolvedConnection>;
}

export class ConnectionNotFoundError extends Error {
  constructor(connectionId: string) {
    super(`No connection registered for id "${connectionId}"`);
    this.name = "ConnectionNotFoundError";
  }
}

// A step reached for a connection its workflow definition never declared.
// Raised before any lookup, so it cannot say whether the id exists.
export class ConnectionNotBoundError extends Error {
  constructor(connectionId: string) {
    super(`Connection "${connectionId}" is not bound to this workflow`);
    this.name = "ConnectionNotBoundError";
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
  return (await shapeConnection(source, secrets)).auth;
}

// Only the values behind `secretRefs` are reported as secret: config fields
// (a base URL, a username) are not, and redacting them would cost debuggability.
export async function shapeConnection(
  source: ConnectionSource,
  secrets: SecretProvider,
): Promise<ResolvedConnection> {
  const resolved = await resolveSecrets(source, secrets);
  if (source.authType === "OAUTH2") return shapeOAuth2(source, resolved);
  return {
    auth: shapeAuth(source, resolved),
    secretValues: Object.values(resolved),
  };
}

// OAUTH2 keeps client_id in config and client_secret plus the host-written
// token set (JSON) in secretRefs; the rest are the method's own props.
function shapeOAuth2(
  source: ConnectionSource,
  resolved: Record<string, string>,
): ResolvedConnection {
  const { client_secret: clientSecret, token, ...secretProps } = resolved;
  const { client_id: clientId, ...configProps } = source.config ?? {};
  if (!token) {
    throw new Error(
      "This OAuth2 connection is not signed in; connect it first",
    );
  }
  let tokens: Record<string, unknown>;
  try {
    tokens = JSON.parse(token) as Record<string, unknown>;
  } catch {
    throw new Error("Stored OAuth2 token is malformed; reconnect");
  }
  const text = (value: unknown, fallback = "") =>
    typeof value === "string" ? value : fallback;
  const auth: OAuth2ConnectionValueWithApp = {
    type: AppConnectionType.OAUTH2,
    client_id: text(clientId),
    client_secret: text(clientSecret),
    redirect_url: text(tokens.redirect_url),
    access_token: text(tokens.access_token),
    refresh_token: text(tokens.refresh_token),
    token_type: text(tokens.token_type, "Bearer"),
    claimed_at: Number(tokens.claimed_at ?? 0),
    scope: text(tokens.scope),
    token_url: text(tokens.token_url),
    ...(typeof tokens.expires_in === "number"
      ? { expires_in: tokens.expires_in }
      : {}),
    data: (tokens.data ?? {}) as Record<string, unknown>,
    props: { ...configProps, ...secretProps },
  };
  // The token blob itself is never what a piece prints; its parts are.
  const secretValues = [
    clientSecret,
    auth.access_token,
    auth.refresh_token,
    ...Object.values(secretProps),
    ...tokenLikeValues(auth.data),
  ].filter((value): value is string => Boolean(value));
  return { auth, secretValues: [...new Set(secretValues)] };
}

// Keys naming a credential: id_token, authed_user.access_token, clientSecret.
// Not every string: a scope or a team name would be blanked all over a log.
const TOKEN_KEY = /(token|secret)$/i;

function tokenLikeValues(value: unknown, key = ""): string[] {
  if (typeof value === "string") return TOKEN_KEY.test(key) ? [value] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => tokenLikeValues(item, key));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([name, item]) =>
      tokenLikeValues(item, name),
    );
  }
  return [];
}

// NONE is the persisted value; the framework's NO_AUTH case carries no value a
// piece reads, so ctx.auth stays undefined rather than becoming that shape.
function shapeAuth(
  source: ConnectionSource,
  resolved: Record<string, string>,
): AppConnectionValue | undefined {
  switch (source.authType) {
    case "NONE":
      return undefined;
    case "SECRET_TEXT": {
      const values = Object.values(resolved);
      if (values.length !== 1) {
        throw new Error(
          `SECRET_TEXT connection must have exactly one secret ref, got ${values.length}`,
        );
      }
      return { type: AppConnectionType.SECRET_TEXT, secret_text: values[0] };
    }
    case "BASIC_AUTH": {
      const props = { ...source.config, ...resolved };
      return {
        type: AppConnectionType.BASIC_AUTH,
        username: props.username,
        password: props.password,
      } as BasicAuthConnectionValue;
    }
    case "CUSTOM_AUTH": {
      return {
        type: AppConnectionType.CUSTOM_AUTH,
        props: { ...source.config, ...resolved },
      };
    }
    default:
      throw new UnsupportedAuthTypeError(source.authType);
  }
}

export class StaticConnectionResolver implements EngineConnectionResolver {
  private readonly connections: Map<string, ConnectionSource>;

  constructor(
    connections: Record<string, ConnectionSource>,
    private readonly secrets: SecretProvider,
  ) {
    this.connections = new Map(Object.entries(connections));
  }

  resolve(connectionId: string): Promise<unknown> {
    return this.resolveWithSecrets(connectionId).then(
      (resolved) => resolved.auth,
    );
  }

  resolveWithSecrets(connectionId: string): Promise<ResolvedConnection> {
    const source = this.connections.get(connectionId);
    if (!source) {
      return Promise.reject(new ConnectionNotFoundError(connectionId));
    }
    return shapeConnection(source, this.secrets);
  }
}

// Every connection a definition declares: the trigger's and each step's.

// A templated id is left out — connectionId is never expression-resolved, so
// it names no connection and a step cannot pick credentials at run time.
export function declaredConnectionIds(
  definition: WorkflowDefinition,
): ReadonlySet<string> {
  const declared = new Set<string>();
  const declare = (connectionId: string | null | undefined) => {
    if (connectionId && !connectionId.includes("{{"))
      declared.add(connectionId);
  };
  declare(definition.trigger?.connectionId);
  for (const step of definition.steps) declare(step.connectionId);
  return declared;
}

// The binding in force for the caller, or undefined when there is none. Read
// per call because one executor serves every concurrent run.
export type ConnectionBindingLookup = () => ReadonlySet<string> | undefined;

// Server-side connection binding (doc 08 §10): a step resolves only what the
// definition its run pinned declared.

// Without a binding nothing resolves, so a path that fails to establish one
// fails closed.
export class BoundConnectionResolver implements EngineConnectionResolver {
  // Present only when the inner resolver has it, because its absence is what
  // tells a caller to fall back to guessing the secrets from the auth value.
  readonly resolveWithSecrets?: (
    connectionId: string,
    request?: ConnectionRequest,
  ) => Promise<ResolvedConnection>;

  constructor(
    private readonly inner: EngineConnectionResolver,
    private readonly binding: ConnectionBindingLookup,
    private readonly onRefused?: (
      connectionId: string,
      request?: ConnectionRequest,
    ) => void,
  ) {
    const withSecrets = inner.resolveWithSecrets?.bind(inner);
    if (!withSecrets) return;
    this.resolveWithSecrets = (connectionId, request) =>
      this.bound(connectionId, request)
        ? withSecrets(connectionId, request)
        : Promise.reject(new ConnectionNotBoundError(connectionId));
  }

  resolve(connectionId: string, request?: ConnectionRequest): Promise<unknown> {
    if (!this.bound(connectionId, request)) {
      return Promise.reject(new ConnectionNotBoundError(connectionId));
    }
    return this.inner.resolve(connectionId, request);
  }

  // Both paths ask the same question, so neither is a way around it.
  private bound(connectionId: string, request?: ConnectionRequest): boolean {
    if (this.binding()?.has(connectionId)) return true;
    this.onRefused?.(connectionId, request);
    return false;
  }
}
