// Read-only AI tool descriptors for the Connect assistant: the project's
// piece catalog, connection documents, and connection health. The `aiTools`
// export is how the host app discovers this package's tools (the line in the
// project index is synced by `ph generate`).
import { resolveDriveSwitchboard } from "@powerhousedao/reactor-browser/ai";
import type { PhAiToolDescriptor } from "@powerhousedao/shared/document-model";
import { z } from "zod";
import {
  connectorIdForPiece,
  packageFromConnectorId,
  planFromAuth,
  type AuthField,
} from "../editors/connection-editor/piece-auth.js";
import {
  checkConnection as runConnectionCheck,
  fetchConnections,
  fetchPieceActions,
  fetchPieceCatalog,
  fetchPieceTriggers,
  setRuntimeUrl,
  type PieceSummary,
} from "../editors/workflow-editor/runtime-api.js";

const MAX_CONNECTORS = 20;

/**
 * Points the module-level runtime client at the selected drive's
 * workflow-runtime subgraph. When no switchboard can be resolved (no
 * selection, local drive with no default URL) the runtime client keeps its
 * existing URL, which falls back to the local development default.
 */
function syncRuntimeUrl(): void {
  if (typeof window === "undefined") return;
  const switchboard = resolveDriveSwitchboard(window.ph?.selectedDriveId);
  if (switchboard) {
    setRuntimeUrl(`${switchboard.graphqlUrl}/workflow-runtime`);
  }
}

export interface ConnectorField {
  name: string;
  label: string;
  required: boolean;
  description?: string;
  secret: boolean;
}

export interface ConnectorDetail {
  connectorId: string;
  pieceName: string;
  displayName: string;
  description: string;
  version: string;
  authType: string;
  /** False for auth kinds the runtime cannot execute yet (OAUTH2, OIDC). */
  supported: boolean;
  fields: ConnectorField[];
  actions: string[];
  triggers: string[];
}

function toField(field: AuthField, secret: boolean): ConnectorField {
  return {
    name: field.name,
    label: field.displayName,
    required: field.required,
    description: field.description,
    secret,
  };
}

async function connectorDetail(piece: PieceSummary): Promise<ConnectorDetail> {
  const plan = planFromAuth(piece.auth);
  const [actions, triggers] = await Promise.all([
    fetchPieceActions(piece.name),
    fetchPieceTriggers(piece.name),
  ]);
  return {
    connectorId: connectorIdForPiece(piece.name),
    pieceName: piece.name,
    displayName: piece.displayName,
    description: piece.description,
    version: piece.version,
    authType: plan.authType,
    supported: plan.supported,
    fields: [
      ...plan.configFields.map((field) => toField(field, false)),
      ...plan.secretFields.map((field) => toField(field, true)),
    ],
    actions: actions.map((action) => action.name),
    triggers: triggers.map((trigger) => trigger.name),
  };
}

/**
 * Stage one of connector discovery: the catalog, optionally narrowed to a
 * case-insensitive substring match on name, display name, or description,
 * capped at {@link MAX_CONNECTORS}. Full auth/action/trigger detail is
 * fetched only for the surviving entries (stage two).
 */
export async function getConnectors(query?: string): Promise<{
  total: number;
  matches: number;
  truncated: boolean;
  connectors: ConnectorDetail[];
}> {
  syncRuntimeUrl();
  const catalog = await fetchPieceCatalog();
  const needle = query?.trim().toLowerCase();
  const matches = needle
    ? catalog.filter((piece) =>
        [piece.name, piece.displayName, piece.description].some((field) =>
          field.toLowerCase().includes(needle),
        ),
      )
    : [...catalog];
  const page = matches.slice(0, MAX_CONNECTORS);
  const connectors = await Promise.all(page.map(connectorDetail));
  return {
    total: catalog.length,
    matches: matches.length,
    truncated: matches.length > page.length,
    connectors,
  };
}

interface ConnectionState {
  config?: unknown;
  secretRefs?: { name: string }[];
}

export interface ConnectionDetail {
  id: string;
  name: string;
  connectorId: string;
  authType: string;
  status: string;
  accountLabel: string | null;
  /** Required secret fields with no stored ref, by auth property name. */
  missingSecrets: string[];
  /** Required config fields with no value, by auth property name. */
  missingConfig: string[];
}

/**
 * Every connection document with its credential state compared against the
 * piece's auth plan. Only field names and opaque refs are surfaced; secret
 * values never do.
 */
export async function getConnections(): Promise<{
  connections: ConnectionDetail[];
}> {
  syncRuntimeUrl();
  const [catalog, summaries] = await Promise.all([
    fetchPieceCatalog(),
    fetchConnections(),
  ]);
  const client =
    typeof window !== "undefined" ? window.ph?.reactorClient : undefined;
  const connections = await Promise.all(
    summaries.map(async (summary) => {
      const piece = catalog.find(
        (entry) => entry.name === packageFromConnectorId(summary.connectorId),
      );
      const plan = planFromAuth(piece?.auth ?? null);
      let state: ConnectionState | undefined;
      if (client) {
        try {
          const document = await client.get(summary.id);
          state = (document.state as { global?: ConnectionState }).global;
        } catch {
          state = undefined;
        }
      }
      const refNames = new Set(
        (state?.secretRefs ?? []).map((ref) => ref.name),
      );
      const config = (state?.config ?? {}) as Record<string, unknown>;
      return {
        id: summary.id,
        name: summary.name,
        connectorId: summary.connectorId,
        authType: summary.authType,
        status: summary.status,
        accountLabel: summary.accountLabel,
        missingSecrets: plan.secretFields
          .filter((field) => field.required && !refNames.has(field.name))
          .map((field) => field.name),
        missingConfig: plan.configFields
          .filter((field) => field.required && config[field.name] === undefined)
          .map((field) => field.name),
      };
    }),
  );
  return { connections };
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const getConnectorsTool: PhAiToolDescriptor = {
  name: "getConnectors",
  description:
    "Lists the connectors (Activepieces pieces) available to the workflow runtime with their auth fields, actions, and triggers. Without a query it returns up to 20 connectors; pass `query` to search by name or description. Secret fields are listed by name only, never by value.",
  inputSchema: { query: z.string().optional() },
  annotations: { title: "Get Connectors", ...READ_ONLY },
  callback: (args: { query?: string }) => getConnectors(args.query),
};

export const getConnectionsTool: PhAiToolDescriptor = {
  name: "getConnections",
  description:
    "Lists the project's connection documents with their credential status: which required secrets and config values are still missing, and the last account label. Secret values are never included.",
  inputSchema: {},
  annotations: { title: "Get Connections", ...READ_ONLY },
  callback: () => getConnections(),
};

export const checkConnectionTool: PhAiToolDescriptor = {
  name: "checkConnection",
  description:
    "Runs a connection's own check against its stored credentials to verify they work. Takes a connection id (from getConnections) and reports success, the failure detail, and the account label when the provider returns one.",
  inputSchema: { connectionId: z.string() },
  annotations: { title: "Check Connection", ...READ_ONLY },
  callback: (args: { connectionId: string }) => {
    syncRuntimeUrl();
    return runConnectionCheck(args.connectionId);
  },
};

/** Tool descriptors the host app offers the AI assistant. */
export const aiTools: PhAiToolDescriptor[] = [
  getConnectorsTool,
  getConnectionsTool,
  checkConnectionTool,
];
