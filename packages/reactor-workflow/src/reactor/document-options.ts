// Design-time options for the document-aware core blocks, backed by the
// reactor's document-model registry and document index.
import type { BaseSubgraph } from "@powerhousedao/reactor-api";

type ReactorClient = BaseSubgraph["reactorClient"];

export interface DocumentOptionEntry {
  label: string;
  value: string;
  // Present on actionType options: SDL of the operation's input type.
  inputSchema?: string;
}

export interface DocumentOptionsResult {
  options: DocumentOptionEntry[];
  placeholder?: string;
}

export const DOCUMENT_OPTION_PROPS = new Set([
  "documentType",
  "documentId",
  "actionType",
]);

// Expression values ({{...}}) can't be resolved at design time.
function staticString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("{{")) return undefined;
  return trimmed;
}

async function documentTypeOptions(
  client: ReactorClient,
): Promise<DocumentOptionsResult> {
  const page = await client.getDocumentModelModules();
  const options = page.results
    .map((module) => module.documentModel.global)
    .map((model) => ({
      label: model.name ? `${model.name} (${model.id})` : model.id,
      value: model.id,
    }))
    .sort((a, b) => a.value.localeCompare(b.value));
  return { options };
}

async function documentIdOptions(
  client: ReactorClient,
  input: Record<string, unknown>,
): Promise<DocumentOptionsResult> {
  const documentType = staticString(input.documentType);
  const page = await client.find(
    documentType ? { type: documentType } : {},
    undefined,
    { cursor: "", limit: 100 },
  );
  const options = page.results.map((document) => {
    // Header name first; many models keep the display name in global state.
    const globalState = (document.state as Record<string, unknown>).global;
    const stateName =
      globalState && typeof globalState === "object"
        ? (globalState as Record<string, unknown>).name
        : undefined;
    const name =
      document.header.name ||
      (typeof stateName === "string" ? stateName : "") ||
      document.header.slug ||
      "(unnamed)";
    return {
      label: `${name} — ${document.header.documentType}`,
      value: document.header.id,
    };
  });
  return {
    options,
    placeholder: documentType
      ? `Documents of type ${documentType}`
      : "All documents on this reactor",
  };
}

async function actionTypeOptions(
  client: ReactorClient,
  input: Record<string, unknown>,
): Promise<DocumentOptionsResult> {
  let documentType = staticString(input.documentType);
  if (!documentType) {
    const documentId = staticString(input.documentId);
    if (documentId) {
      const document = await client.get(documentId);
      documentType = document.header.documentType;
    }
  }
  if (!documentType) {
    return {
      options: [],
      placeholder:
        "Set a document type (or a resolvable document id) to list actions",
    };
  }
  const module = await client.getDocumentModelModule(documentType);
  const latest = module.documentModel.global.specifications.at(-1);
  const options = (latest?.modules ?? []).flatMap((specModule) =>
    specModule.operations
      .filter((operation) => operation.name)
      .map((operation) => ({
        label: `${operation.name} (${specModule.name})`,
        value: operation.name ?? "",
        inputSchema: operation.schema ?? undefined,
      })),
  );
  return { options, placeholder: `Actions of ${documentType}` };
}

export async function resolveDocumentOptions(
  client: ReactorClient,
  propName: string,
  input: Record<string, unknown>,
): Promise<DocumentOptionsResult> {
  switch (propName) {
    case "documentType":
      return documentTypeOptions(client);
    case "documentId":
      return documentIdOptions(client, input);
    case "actionType":
      return actionTypeOptions(client, input);
    default:
      throw new Error(`No document options resolver for prop "${propName}"`);
  }
}
