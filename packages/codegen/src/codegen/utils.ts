import {
  DocumentModel,
  DocumentModelState,
  utils,
} from "document-model/document-model";
import fs from "node:fs";

export async function loadDocumentModel(
  path: string,
): Promise<DocumentModelState> {
  let documentModel: DocumentModelState;
  try {
    if (!path) {
      throw new Error("Document model file not specified");
    } else if (path.endsWith(".zip")) {
      const file = await utils.loadFromFile(path);
      documentModel = file.state.global;
    } else if (path.endsWith(".json")) {
      const data = fs.readFileSync(path, "utf-8");
      const document = (JSON.parse(data) as DocumentModel).state
        .global as DocumentModelState;
      documentModel = document;
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
