import { z } from "zod";

/**
 * Read-only reactor tools for the agent host (mastra-runner). They wrap the
 * attached reactor client — the switchboard the host joined — so the model
 * can look at the fleet's documents instead of guessing: list drives, list a
 * drive's documents by type, read one document's state. Writes stay out: the
 * agent names the operation it would apply and a person applies it.
 *
 * The client is the IReactorClient-compatible GraphQL client from
 * `attachRemoteReactor`; only `find` and `get` are used, typed structurally so
 * this module does not pull the reactor packages into clint's graph.
 */

interface DocumentHeader {
  id: string;
  slug?: string;
  name?: string;
  documentType: string;
  createdAtUtcIso?: string;
  lastModifiedAtUtcIso?: string;
  revision?: Record<string, number>;
}

interface DocumentLike {
  header: DocumentHeader;
  state: Record<string, unknown>;
}

interface Paged<T> {
  results: T[];
  next?: () => Promise<Paged<T>>;
}

export interface ReactorReadClient {
  find(
    search: { type?: string; parentId?: string },
    view?: undefined,
    paging?: { cursor: string; limit: number },
  ): Promise<Paged<DocumentLike>>;
  get(identifier: string): Promise<DocumentLike>;
}

export interface ReactorReadToolsOptions {
  /** Cap on the serialized state a `getDocument` call returns (default 24k). */
  maxStateChars?: number;
  /** Cap on the documents one `listDocuments` call returns (default 200). */
  maxList?: number;
}

const DRIVE_TYPE = "powerhouse/document-drive";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The global scope's state, whichever way the client shaped `state`. */
function globalState(doc: DocumentLike): Record<string, unknown> {
  const state = doc.state;
  if (isRecord(state.global)) return state.global;
  return state;
}

/**
 * A one-line view of a state object: its scalar fields, and the length of
 * each array field — enough to pick a document from a list without reading
 * every one.
 */
export function summarizeState(
  state: Record<string, unknown>,
  maxKeys = 16,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let keys = 0;
  for (const [key, value] of Object.entries(state)) {
    if (keys >= maxKeys) break;
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      out[`${key}Count`] = value.length;
      keys++;
    } else if (typeof value !== "object") {
      out[key] =
        typeof value === "string" && value.length > 120
          ? `${value.slice(0, 117)}…`
          : value;
      keys++;
    } else if (isRecord(value) && typeof value.name === "string") {
      // e.g. counterparty: { name }, submitter: { name }
      out[key] = value.name;
      keys++;
    }
  }
  return out;
}

function headerOf(doc: DocumentLike) {
  const h = doc.header;
  return {
    id: h.id,
    slug: h.slug ?? undefined,
    name: h.name ?? undefined,
    documentType: h.documentType,
    lastModified: h.lastModifiedAtUtcIso ?? undefined,
  };
}

async function collect(
  first: Paged<DocumentLike>,
  max: number,
): Promise<DocumentLike[]> {
  const out = [...first.results];
  let page = first;
  while (out.length < max && page.next && page.results.length > 0) {
    page = await page.next();
    out.push(...page.results);
  }
  return out.slice(0, max);
}

function truncateJson(
  value: unknown,
  maxChars: number,
): {
  json: string;
  truncated: boolean;
} {
  const json = JSON.stringify(value, null, 1);
  if (json.length <= maxChars) return { json, truncated: false };
  return { json: `${json.slice(0, maxChars)}…`, truncated: true };
}

/**
 * Build the Mastra tool set over an attached reactor client. Mastra is
 * imported lazily, like the rest of clint's Mastra integration.
 */
export async function createReactorReadTools(
  client: ReactorReadClient,
  options: ReactorReadToolsOptions = {},
) {
  const { createTool } = await import("@mastra/core/tools");
  const maxStateChars = options.maxStateChars ?? 24_000;
  const maxList = options.maxList ?? 200;

  const listDrives = createTool({
    id: "listDrives",
    description:
      "List the drives on the reactor this agent is attached to: id, slug, " +
      "name and how many nodes (documents and folders) each holds. Call this " +
      "first when you do not know a drive id.",
    inputSchema: z.object({}),
    execute: async () => {
      const page = await client.find({ type: DRIVE_TYPE }, undefined, {
        cursor: "0",
        limit: 100,
      });
      const drives = await collect(page, 100);
      return {
        drives: drives.map((d) => {
          const state = globalState(d);
          const nodes = Array.isArray(state.nodes) ? state.nodes.length : 0;
          return {
            ...headerOf(d),
            name:
              (typeof state.name === "string" && state.name) || d.header.name,
            nodeCount: nodes,
          };
        }),
      };
    },
  });

  const listDocuments = createTool({
    id: "listDocuments",
    description:
      "List documents on the reactor, optionally within one drive (driveId) " +
      "and/or of one document type (e.g. sektar/invoice). Returns each " +
      "document's id, slug, name, type and a one-line summary of its state " +
      "(scalar fields plus array lengths). Use getDocument for the full state.",
    inputSchema: z.object({
      driveId: z
        .string()
        .optional()
        .describe("Drive id to list within (from listDrives). Omit for all."),
      documentType: z
        .string()
        .optional()
        .describe("Document type to filter by, e.g. sektar/invoice."),
      limit: z
        .number()
        .int()
        .positive()
        .max(maxList)
        .optional()
        .describe(`Maximum documents to return (default 100, max ${maxList}).`),
    }),
    execute: async (input) => {
      const limit = Math.min(input.limit ?? 100, maxList);
      const page = await client.find(
        {
          ...(input.documentType ? { type: input.documentType } : {}),
          ...(input.driveId ? { parentId: input.driveId } : {}),
        },
        undefined,
        { cursor: "0", limit: Math.min(limit, 100) },
      );
      const docs = (await collect(page, limit)).filter(
        (d) => d.header.documentType !== DRIVE_TYPE || !!input.documentType,
      );
      return {
        count: docs.length,
        documents: docs.map((d) => ({
          ...headerOf(d),
          summary: summarizeState(globalState(d)),
        })),
      };
    },
  });

  const getDocument = createTool({
    id: "getDocument",
    description:
      "Read one document by id or slug: its header and full global state as " +
      "JSON (truncated past a size cap; say so if `truncated` is true).",
    inputSchema: z.object({
      identifier: z.string().describe("Document id or slug."),
    }),
    execute: async (input) => {
      const doc = await client.get(input.identifier);
      const { json, truncated } = truncateJson(globalState(doc), maxStateChars);
      return { ...headerOf(doc), state: json, truncated };
    },
  });

  return { listDrives, listDocuments, getDocument };
}
