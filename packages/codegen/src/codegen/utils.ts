import type {
  DocumentModelDocument,
  DocumentModelGlobalState,
  DocumentModelPHState,
} from "document-model";
import { documentModelReducer } from "document-model";
import { baseLoadFromFile } from "document-model/node";
import fs from "node:fs";
import { format } from "prettier";
export async function loadDocumentModel(
  path: string,
): Promise<DocumentModelGlobalState> {
  let documentModel: DocumentModelGlobalState;
  try {
    if (!path) {
      throw new Error("Document model file not specified");
    } else if (path.endsWith(".zip")) {
      const file = await baseLoadFromFile(path, documentModelReducer);
      documentModel = file.state.global;
    } else if (path.endsWith(".json")) {
      const data = fs.readFileSync(path, "utf-8");
      const parsedData = JSON.parse(data) as DocumentModelDocument;
      if ("state" in parsedData) {
        documentModel = parsedData.state.global;
      } else {
        documentModel = parsedData;
      }
    } else {
      throw new Error("File type not supported. Must be zip or json.");
    }
    return documentModel;
  } catch (error) {
    throw (error as { code?: string }).code === "MODULE_NOT_FOUND"
      ? new Error(`Document model not found.`)
      : error;
  }
}

export async function formatWithPrettierBeforeWrite(
  outputFile: string,
  content: string,
) {
  const modifiedContent = await format(content, {
    parser: "typescript",
  });
  return modifiedContent;
}
