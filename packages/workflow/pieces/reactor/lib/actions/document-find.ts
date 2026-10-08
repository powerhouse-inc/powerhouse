import {
  createAction,
  Property,
  type ReactorReadClient,
} from "@powerhousedao/pieces-framework";
import type { SearchFilter } from "@powerhousedao/reactor";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { displayName, documentOutput, matchesState } from "../documents.js";
import { documentTypes, documentTypeProp, driveProp } from "../reactor.js";

const BLOCK = "document-find";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
// A filtered search stops after this many pages and hands back a cursor.
const MAX_PAGES = 20;

// Where a search resumes: query, the client's page cursor, rows consumed of
// that page, and the page size the cursor was read with.
interface FindCursor {
  q: number;
  c: string;
  s: number;
  l: number;
}

function encodeCursor(cursor: FindCursor): string {
  return btoa(JSON.stringify(cursor));
}

function decodeCursor(value: unknown): FindCursor | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  try {
    const parsed = JSON.parse(
      atob(typeof value === "string" ? value.trim() : ""),
    ) as FindCursor;
    if (
      Number.isInteger(parsed.q) &&
      typeof parsed.c === "string" &&
      Number.isInteger(parsed.s) &&
      Number.isInteger(parsed.l)
    ) {
      return parsed;
    }
  } catch {
    // Reported below.
  }
  throw new Error(`${BLOCK}: "cursor" is not a nextCursor this step returned`);
}

// One query per installed type unless a type is named: the index needs one.
async function queries(
  reactor: ReactorReadClient,
  documentType: string | undefined,
  parentId: string | undefined,
): Promise<SearchFilter[]> {
  const parent = parentId ? { parentId } : {};
  if (documentType) return [{ type: documentType, ...parent }];
  if (parentId) return [parent];
  return (await documentTypes(reactor)).map((entry) => ({
    type: entry.documentType,
  }));
}

export const documentFindAction = createAction({
  name: BLOCK,
  displayName: "Find documents",
  description: "Lists documents by type and name.",
  requireAuth: false,
  requireReactor: "read",
  props: {
    documentType: documentTypeProp("Document type", false, "Omit for any type"),
    parentId: driveProp("In drive", "Omit for the whole reactor"),
    name: Property.ShortText({
      displayName: "Name contains",
      description: "Case-insensitive match",
      required: false,
    }),
    matchPath: Property.ShortText({
      displayName: "State field",
      description:
        'Dotted path into the document\'s state, e.g. "orderId" or "settlement.status". With a value below, only documents holding it are returned.',
      required: false,
    }),
    matchValue: Property.ShortText({
      displayName: "State value",
      description:
        "Compared as text, e.g. {{trigger.payload.orderId}}. Documents missing the field never match.",
      required: false,
    }),
    includeState: Property.Checkbox({
      displayName: "Include state",
      description:
        "Returns each document's state as well as its header. Off by default: a page of documents carries a page of states.",
      required: false,
      defaultValue: false,
    }),
    limit: Property.Number({
      displayName: "Max results",
      description: `Defaults to ${DEFAULT_LIMIT}, at most ${MAX_LIMIT}`,
      required: false,
    }),
    cursor: Property.ShortText({
      displayName: "Cursor",
      description:
        "Resumes a search, e.g. {{steps.find.output.nextCursor}}; omit to start from the first page",
      required: false,
      advanced: true,
    }),
  },
  run: async (ctx) => {
    const {
      documentType,
      parentId,
      name,
      limit,
      matchPath,
      matchValue,
      includeState,
    } = ctx.propsValue;
    const capped = Math.min(
      Math.max(typeof limit === "number" ? limit : DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    // A field without a value, or the reverse, is an unfinished step; it must
    // not read as "no filter".
    const path = typeof matchPath === "string" ? matchPath.trim() : "";
    const wanted = typeof matchValue === "string" ? matchValue.trim() : "";
    if ((path === "") !== (wanted === "")) {
      throw new Error(
        `${BLOCK}: "State field" and "State value" are set together or not at all`,
      );
    }
    const needle = typeof name === "string" ? name.trim().toLowerCase() : "";
    const match = path ? { path, value: wanted } : undefined;
    const keep = (document: PHDocument) =>
      (!needle || displayName(document).toLowerCase().includes(needle)) &&
      matchesState(document, match);
    // Unfiltered, a page holds exactly what is left to return.
    const filtered = needle !== "" || match !== undefined;

    const searches = await queries(
      ctx.reactor,
      typeof documentType === "string" && documentType.trim()
        ? documentType.trim()
        : undefined,
      typeof parentId === "string" && parentId.trim()
        ? parentId.trim()
        : undefined,
    );
    const resumed = decodeCursor(ctx.propsValue.cursor);
    let at: FindCursor = resumed ?? { q: 0, c: "", s: 0, l: 0 };
    const found: PHDocument[] = [];
    let nextCursor: string | undefined;
    for (let pages = 0; at.q < searches.length; pages++) {
      if (filtered && pages >= MAX_PAGES) {
        nextCursor = encodeCursor(at);
        break;
      }
      const size =
        at.l || (filtered ? MAX_LIMIT : Math.max(capped - found.length, 1));
      const page = await ctx.reactor.find(searches[at.q], undefined, {
        cursor: at.c,
        limit: size,
      });
      let index = at.s;
      for (; index < page.results.length && found.length < capped; index++) {
        if (keep(page.results[index])) found.push(page.results[index]);
      }
      const after: FindCursor | undefined =
        index < page.results.length
          ? { q: at.q, c: at.c, s: index, l: size }
          : page.nextCursor && page.results.length > 0
            ? { q: at.q, c: page.nextCursor, s: 0, l: 0 }
            : at.q + 1 < searches.length
              ? { q: at.q + 1, c: "", s: 0, l: 0 }
              : undefined;
      if (!after) break;
      if (found.length >= capped) {
        nextCursor = encodeCursor(after);
        break;
      }
      at = after;
    }

    return {
      results: found.map((document) =>
        includeState === true
          ? documentOutput(document)
          : { header: document.header },
      ),
      ...(nextCursor ? { nextCursor } : {}),
    };
  },
});
