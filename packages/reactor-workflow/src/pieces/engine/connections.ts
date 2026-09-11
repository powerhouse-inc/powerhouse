// Resolves connection references into the auth value a piece reads from
// ctx.auth, shaped per Activepieces auth kind (powerhouse/connection state).

import type { SecretProvider } from "./secrets.js";
import type { WorkflowDefinition } from "./types.js";

export type ConnectionAuthType =
  | "SECRET_TEXT"
  | "BASIC_AUTH"
  | "CUSTOM_AUTH"
  | "OAUTH2"
  | "OIDC"
  | "NONE";

// Mirrors the powerhouse/connection document state the resolver consumes.
export interface ConnectionSource {
  authType: ConnectionAuthType;
  config?: Record<string, unknown>;
  secretRefs?: { name: string; ref: string }[];
}

// Which step is asking. A resolver needs it to check the request against the
// run's binding rather than trust the id it was handed.

// piecePackage is the package the caller already resolved the block type to,
// so a resolver never re-parses a block type to learn which piece is asking.
export interface ConnectionRequest {
  blockType: string;
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
  return {
    auth: shapeAuth(source, resolved),
    secretValues: Object.values(resolved),
  };
}

function shapeAuth(
  source: ConnectionSource,
  resolved: Record<string, string>,
): unknown {
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
      return { type: "SECRET_TEXT", secret_text: values[0] };
    }
    case "BASIC_AUTH": {
      const props = { ...source.config, ...resolved };
      return {
        type: "BASIC_AUTH",
        username: props.username,
        password: props.password,
      };
    }
    case "CUSTOM_AUTH": {
      return { type: "CUSTOM_AUTH", props: { ...source.config, ...resolved } };
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
    if (connectionId && !connectionId.includes("{{")) declared.add(connectionId);
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
  constructor(
    private readonly inner: EngineConnectionResolver,
    private readonly binding: ConnectionBindingLookup,
    private readonly onRefused?: (
      connectionId: string,
      request?: ConnectionRequest,
    ) => void,
  ) {}

  resolve(connectionId: string, request?: ConnectionRequest): Promise<unknown> {
    if (!this.binding()?.has(connectionId)) {
      this.onRefused?.(connectionId, request);
      return Promise.reject(new ConnectionNotBoundError(connectionId));
    }
    return this.inner.resolve(connectionId, request);
  }
}
