import type {
  DocumentModelDocument,
  DocumentModelGlobalState,
} from "@powerhousedao/shared/document-model";
import { documentModelReducer } from "@powerhousedao/shared/document-model";
import { baseLoadFromFile } from "document-model/node";
import { readFile } from "node:fs/promises";

export function sortByKey<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
  ) as T;
}

export async function loadDocumentModel(
  path: string,
): Promise<DocumentModelGlobalState> {
  let documentModel: DocumentModelGlobalState;
  try {
    if (!path) {
      throw new Error("Document model file not specified");
    } else if (path.endsWith(".zip") || path.endsWith(".phd")) {
      const file = await baseLoadFromFile(path, documentModelReducer);
      documentModel = file.state.global;
    } else if (path.endsWith(".json")) {
      const data = await readFile(path, "utf-8");
      const parsedData = JSON.parse(data) as DocumentModelDocument;
      if ("state" in parsedData) {
        documentModel = parsedData.state.global;
      } else {
        documentModel = parsedData;
      }
    } else {
      throw new Error("File type not supported. Must be zip, phd, or json.");
    }
    return documentModel;
  } catch (error) {
    throw (error as { code?: string }).code === "MODULE_NOT_FOUND"
      ? new Error(`Document model not found.`)
      : error;
  }
}
