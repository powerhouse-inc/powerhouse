// Runtime GraphQL client feeding the vendored pieces UI from the
// workflow-runtime subgraph (piece catalog, detail, dynamic options).
import type {
  ActionBase,
  PieceMetadataModel,
  PieceMetadataModelSummary,
  TriggerBase,
} from "../vendor/pieces-framework/index.js";
import {
  TriggerStrategy,
  TriggerTestStrategy,
} from "../vendor/piece-types/index.js";
import {
  PackageType,
  PieceType,
  type PieceOptionRequest,
} from "../vendor/shared/index.js";

const DEFAULT_RUNTIME_URL = "http://localhost:4001/graphql/workflow-runtime";

let runtimeUrl = DEFAULT_RUNTIME_URL;

export function setApRuntimeUrl(url: string): void {
  if (url === runtimeUrl) return;
  runtimeUrl = url;
  catalogCache = undefined;
  detailCache.clear();
}

async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(runtimeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (body.errors?.length) throw new Error(body.errors[0].message);
  if (!body.data) throw new Error("Empty GraphQL response");
  return body.data;
}

// Synthetic piece exposing Powerhouse core blocks through the AP piece UI.
export const POWERHOUSE_PIECE_NAME = "@powerhouse/core";
export const POWERHOUSE_PIECE_VERSION = "0.0.1";
export const POWERHOUSE_LOGO_URL =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#0f172a"/><text x="24" y="31" font-family="system-ui,sans-serif" font-size="18" font-weight="700" fill="#fff" text-anchor="middle">PH</text></svg>`,
  );

const packageMeta = {
  projectUsage: 0,
  pieceType: PieceType.OFFICIAL,
  packageType: PackageType.REGISTRY,
};

function coreAction(name: string, displayName: string, description: string) {
  return {
    name,
    displayName,
    description,
    props: {},
    requireAuth: false,
  } as ActionBase;
}

function coreTrigger(name: string, displayName: string, description: string) {
  return {
    name,
    displayName,
    description,
    props: {},
    requireAuth: false,
    type: TriggerStrategy.POLLING,
    sampleData: {},
    testStrategy: TriggerTestStrategy.SIMULATION,
  } as TriggerBase;
}

const POWERHOUSE_ACTIONS: Record<string, ActionBase> = {
  "document-create": coreAction(
    "document-create",
    "Create document",
    "Creates a Powerhouse document.",
  ),
  "document-dispatch": coreAction(
    "document-dispatch",
    "Dispatch actions",
    "Sends actions to a Powerhouse document.",
  ),
};

const POWERHOUSE_TRIGGERS: Record<string, TriggerBase> = {
  manual: coreTrigger("manual", "Manual", "Fired on demand with a payload."),
  "document-event": coreTrigger(
    "document-event",
    "Document event",
    "Fires when a matching document operation lands.",
  ),
};

export const POWERHOUSE_PIECE: PieceMetadataModel = {
  name: POWERHOUSE_PIECE_NAME,
  displayName: "Powerhouse",
  description: "Powerhouse document triggers and core actions.",
  logoUrl: POWERHOUSE_LOGO_URL,
  authors: ["Powerhouse"],
  version: POWERHOUSE_PIECE_VERSION,
  actions: POWERHOUSE_ACTIONS,
  triggers: POWERHOUSE_TRIGGERS,
  contextInfo: undefined,
  ...packageMeta,
};

const POWERHOUSE_SUMMARY: PieceMetadataModelSummary = {
  name: POWERHOUSE_PIECE_NAME,
  displayName: "Powerhouse",
  description: POWERHOUSE_PIECE.description,
  logoUrl: POWERHOUSE_LOGO_URL,
  authors: ["Powerhouse"],
  version: POWERHOUSE_PIECE_VERSION,
  actions: Object.keys(POWERHOUSE_ACTIONS).length,
  triggers: Object.keys(POWERHOUSE_TRIGGERS).length,
  suggestedActions: Object.values(POWERHOUSE_ACTIONS),
  suggestedTriggers: Object.values(POWERHOUSE_TRIGGERS),
  contextInfo: undefined,
  ...packageMeta,
};

interface CatalogSummary {
  name: string;
  displayName: string;
  description: string;
  logoUrl: string;
  version: string;
  actionCount: number;
  triggerCount?: number;
  categories?: string[];
  auth?: unknown;
}

let catalogCache: Promise<PieceMetadataModelSummary[]> | undefined;

export function fetchCatalogSummaries(): Promise<PieceMetadataModelSummary[]> {
  catalogCache ??= gql<{
    workflowRuntime: { pieceCatalog: CatalogSummary[] };
  }>(`query Catalog { workflowRuntime { pieceCatalog } }`, {}).then((data) => [
    POWERHOUSE_SUMMARY,
    ...data.workflowRuntime.pieceCatalog.map(
      (entry): PieceMetadataModelSummary => ({
        name: entry.name,
        displayName: entry.displayName,
        description: entry.description,
        logoUrl: entry.logoUrl,
        authors: [],
        version: entry.version,
        actions: entry.actionCount,
        triggers: 0,
        auth: entry.auth as PieceMetadataModelSummary["auth"],
        contextInfo: undefined,
        ...packageMeta,
      }),
    ),
  ]);
  catalogCache.catch(() => (catalogCache = undefined));
  return catalogCache;
}

const detailCache = new Map<string, Promise<PieceMetadataModel>>();

export function fetchPieceModel(name: string): Promise<PieceMetadataModel> {
  if (name === POWERHOUSE_PIECE_NAME) return Promise.resolve(POWERHOUSE_PIECE);
  let cached = detailCache.get(name);
  if (!cached) {
    cached = gql<{ workflowRuntime: { pieceDetail: unknown } }>(
      `query Detail($packageName: String!) {
        workflowRuntime { pieceDetail(packageName: $packageName) }
      }`,
      { packageName: name },
    ).then((data) => {
      const detail = data.workflowRuntime.pieceDetail as PieceMetadataModel;
      return { ...packageMeta, ...detail };
    });
    detailCache.set(name, cached);
    cached.catch(() => detailCache.delete(name));
  }
  return cached;
}

interface OptionsResult {
  workflowRuntime: { blockOptions: unknown };
}

export async function loadPieceOptions(
  request: PieceOptionRequest,
  propertyType: unknown,
): Promise<unknown> {
  const blockType = `${request.pieceName}@${request.pieceVersion}#${request.actionOrTriggerName}`;
  const data = await gql<OptionsResult>(
    `query Options($blockType: String!, $propName: String!, $input: Unknown) {
      workflowRuntime { blockOptions(blockType: $blockType, propName: $propName, input: $input) }
    }`,
    {
      blockType,
      propName: request.propertyName,
      input: request.input ?? {},
    },
  );
  return { type: propertyType, options: data.workflowRuntime.blockOptions };
}
