// Documents as model input: picked through ctx.reactor, read as compact views.
import {
  Property,
  ReactorAccessDeniedError,
  type PropertyContext,
  type ReactorReadClient,
} from "@powerhousedao/pieces-framework";
import {
  documentView,
  getDocument,
  type DocumentView,
} from "@powerhousedao/reactor-mcp/tools";
import { documentOptions } from "../../reactor/lib/reactor.js";

// The document reads the AI actions make; they never query an index.
export type DocumentReader = Omit<ReactorReadClient, "query">;

// Bounds one step's prompt; each view is trimmed on its own.
export const MAX_DOCUMENTS = 50;

export function designTimeReactor(ctx: PropertyContext): ReactorReadClient {
  if (ctx.reactor) return ctx.reactor;
  const error = new Error("ctx.reactor is not served to this resolver");
  error.name = ReactorAccessDeniedError;
  throw error;
}

// Every document on the reactor, labelled "name — type".
export const documentsProp = (
  displayName: string,
  required: boolean,
  placeholder = "Choose documents",
) =>
  Property.MultiSelectDropdown<string, typeof required>({
    auth: undefined,
    displayName,
    description:
      "Pick documents, or give ids from an earlier step as a list or comma-separated text.",
    required,
    refreshers: [],
    options: async (_propsValue, ctx) => ({
      ...(await documentOptions(designTimeReactor(ctx), undefined)),
      placeholder,
    }),
  });

function idOf(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry.trim() || undefined;
  if (entry && typeof entry === "object") {
    const record = entry as Record<string, unknown>;
    const id = record.documentId ?? record.id;
    if (typeof id === "string") return id.trim() || undefined;
  }
  return undefined;
}

// A list, JSON text of one, or comma/newline-separated ids; entries may be
// references with a documentId. Deduplicated, in order.
export function parseDocumentIds(value: unknown): string[] {
  let list: unknown = value;
  if (typeof value === "string") {
    const text = value.trim();
    if (text.startsWith("[")) {
      try {
        list = JSON.parse(text);
      } catch {
        throw new Error("The document list is not valid JSON.");
      }
    } else {
      list = text.split(/[\n,]/);
    }
  }
  if (!Array.isArray(list)) list = list == null ? [] : [list];
  const ids: string[] = [];
  for (const [index, entry] of (list as unknown[]).entries()) {
    const id = idOf(entry);
    if (id === undefined) {
      if (typeof entry === "string") continue;
      throw new Error(`Document ${index + 1} is not a document id.`);
    }
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length > MAX_DOCUMENTS) {
    throw new Error(
      `Too many documents: ${ids.length}. A step reads at most ${MAX_DOCUMENTS}.`,
    );
  }
  return ids;
}

export async function readDocumentViews(
  reactor: DocumentReader,
  ids: readonly string[],
  filter?: string,
): Promise<DocumentView[]> {
  return Promise.all(
    ids.map(async (id) => {
      const document = await getDocument(reactor, id).catch((error: Error) => {
        throw new Error(`Document "${id}": ${error.message}`, { cause: error });
      });
      return documentView(document, filter ? { filter } : {});
    }),
  );
}

export const filterProp = () =>
  Property.ShortText({
    displayName: "State filter",
    description:
      "JSONPath applied to each document's state, e.g. $.global.items. Leave empty for the whole trimmed state.",
    required: false,
    advanced: true,
  });

export function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim() || undefined;
}
