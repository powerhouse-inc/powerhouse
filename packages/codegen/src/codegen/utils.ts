import type { DocumentTypesMap } from "@powerhousedao/codegen";
import { pascalCase } from "change-case";
import type {
  DocumentModelDocument,
  DocumentModelGlobalState,
} from "document-model";
import { documentModelReducer } from "document-model";
import { baseLoadFromFile } from "document-model/node";
import fs from "node:fs";
import { join, resolve } from "node:path";
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

/** returns map of document model id to document model name in pascal case and import path */
export function getDocumentTypesMap(
  dir: string,
  pathOrigin = "../../",
): DocumentTypesMap {
  const documentTypesMap: DocumentTypesMap = {
    "powerhouse/document-model": {
      name: "DocumentModel",
      importPath: `document-model`,
    },
  };

  // add document types from provided dir
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
      .forEach((name) => {
        const specPath = resolve(dir, name, `${name}.json`);
        if (!fs.existsSync(specPath)) {
          return;
        }

        const specRaw = fs.readFileSync(specPath, "utf-8");
        try {
          const spec = JSON.parse(specRaw) as DocumentModelGlobalState;
          if (spec.id) {
            documentTypesMap[spec.id] = {
              name: pascalCase(name),
              importPath: join(pathOrigin, dir, name),
            };
          }
        } catch {
          console.error(`Failed to parse ${specPath}`);
        }
      });
  }

  return documentTypesMap;
}
