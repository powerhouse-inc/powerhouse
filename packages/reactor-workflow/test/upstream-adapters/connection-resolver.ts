// Upstream's createConnectionResolver over ours: a powerhouse/connection
// document resolved by resolveConnectionWithSecrets, read back as ctx.auth.
import type { ContextVersion } from "@powerhousedao/pieces-framework";
import type { ConnectionDocument } from "@powerhousedao/workflow/document-models/connection";
import { buildActionContext } from "../../src/pieces/activepieces/context/action.js";
import { InMemorySecretProvider } from "../../src/pieces/engine/secrets.js";
import { resolveConnectionWithSecrets } from "../../src/reactor/lib.js";
import type { AppConnectionStatus } from "./shared.js";

interface UpstreamConnection {
  id: string;
  name: string;
  pieceName: string;
  status: AppConnectionStatus;
  value: Record<string, unknown> & { type: string };
}

interface ResolverParams {
  projectId: string;
  apiUrl: string;
  engineToken: string;
  // Read by upstream to shape the value per context version; we have no such input.
  contextVersion: ContextVersion | undefined;
  pieceName?: string;
}

const seeded = new Map<string, UpstreamConnection>();

// Stands in for upstream's platform API answering a lookup by name.
export function seedConnection(connection: UpstreamConnection): void {
  seeded.set(connection.name, connection);
}

const STATUS: Record<AppConnectionStatus, string> = {
  ACTIVE: "OK",
  MISSING: "UNCONFIGURED",
  ERROR: "ERROR",
};

// Secrets go to the secret provider behind refs; everything else is config.
function toDocument(connection: UpstreamConnection): {
  document: ConnectionDocument;
  secrets: Record<string, string>;
} {
  const { type, ...fields } = connection.value;
  const secrets: Record<string, string> = {};
  const secretRefs: { id: string; name: string; ref: string }[] = [];
  const secret = (name: string, value: unknown) => {
    const ref = `secret://v1:${connection.id}-${name}`;
    secrets[ref] = String(value);
    secretRefs.push({ id: name, name, ref });
  };
  let config: Record<string, unknown> = {};
  if (type === "SECRET_TEXT") secret("secret_text", fields.secret_text);
  else if (type === "BASIC_AUTH") {
    config = { username: fields.username };
    secret("password", fields.password);
  } else if (type === "CUSTOM_AUTH") {
    config = (fields.props ?? {}) as Record<string, unknown>;
  } else config = fields;
  const document = {
    header: { id: connection.id, documentType: "powerhouse/connection" },
    state: {
      global: {
        name: connection.name,
        connectorId: `${connection.pieceName}#${connection.pieceName}`,
        authType: type,
        config,
        secretRefs,
        status: STATUS[connection.status],
      },
    },
  } as unknown as ConnectionDocument;
  return { document, secrets };
}

// The asking step is the connection's own piece unless one is named, so
// our connector binding (always on) matches upstream's default of not binding.
export function createConnectionResolver({ pieceName }: ResolverParams) {
  return {
    async obtain(externalId: string): Promise<unknown> {
      const connection = seeded.get(externalId);
      if (!connection) throw new Error(`No connection "${externalId}"`);
      const { document, secrets } = toDocument(connection);
      const { auth } = await resolveConnectionWithSecrets(
        document,
        new InMemorySecretProvider(secrets),
        {
          blockType: `${connection.pieceName}#action`,
          piecePackage: pieceName ?? connection.pieceName,
        },
      );
      return buildActionContext({ propsValue: {}, auth }).context.auth;
    },
  };
}
