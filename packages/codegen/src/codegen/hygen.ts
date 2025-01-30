import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Logger, runner } from "hygen";
import { DocumentModel } from "document-model";
import { loadDocumentModel } from "./utils";
import { DocumentTypesMap } from ".";
import { pascalCase } from "change-case";

const require = createRequire(import.meta.url);

const __dirname =
  import.meta.dirname || path.dirname(fileURLToPath(import.meta.url));
const logger = new Logger(console.log.bind(console));
const defaultTemplates = path.join(__dirname, ".hygen", "templates");

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function run(args: string[], { watch = false, skipFormat = false } = {}) {
  const result = await runner(args, {
    templates: defaultTemplates,
    cwd: process.cwd(),
    logger,
    createPrompter: () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return require("enquirer");
    },
    exec: (action, body) => {
      const opts = body && body.length > 0 ? { input: body } : {};
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      return require("execa").shell(action, opts);
    },
    debug: !!process.env.DEBUG,
  });
  if (!skipFormat) {
    const execa = await import("execa");
    const actions = result.actions as { status: string; subject: string }[];
    actions
      .filter((action) => ["added", "inject"].includes(action.status))
      .forEach((action) => {
        execa.$`prettier --ignore-path --write ${action.subject.replace(
          ".",
          process.cwd(),
        )}`.catch((err: unknown) => {
          console.log(err);
        });
      });
  }

  return result;
}

export async function generateAll(
  dir: string,
  { watch = false, skipFormat = false } = {},
) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const directory of files.filter((f) => f.isDirectory())) {
    const documentModelPath = path.join(
      dir,
      directory.name,
      `${directory.name}.json`,
    );
    if (!fs.existsSync(documentModelPath)) {
      continue;
    }

    try {
      const documentModel = await loadDocumentModel(documentModelPath);
      await generateDocumentModel(documentModel, dir, { watch, skipFormat });
    } catch (error) {
      console.error(directory.name, error);
    }
  }
}

export async function generateDocumentModel(
  documentModel: DocumentModel.DocumentModelState,
  dir: string,
  { watch = false, skipFormat = false } = {},
) {
  // Generate the singular files for the document model logic
  await run(
    [
      "powerhouse",
      "generate-document-model",
      "--document-model",
      JSON.stringify(documentModel),
      "--root-dir",
      dir,
    ],
    { watch, skipFormat },
  );

  // Generate the module-specific files for the document model logic
  const latestSpec =
    documentModel.specifications[documentModel.specifications.length - 1];
  for (const module of latestSpec.modules) {
    await run(
      [
        "powerhouse",
        "generate-document-model-module",
        "--document-model",
        JSON.stringify(documentModel),
        "--root-dir",
        dir,
        "--module",
        module.name,
      ],
      { watch, skipFormat },
    );
  }
}

export async function generateEditor(
  name: string,
  documentTypes: string[],
  documentTypesMap: DocumentTypesMap,
  dir: string,
  documentModelsDir: string,
  { skipFormat = false } = {},
) {
  // Generate the singular files for the document model logic
  await run(
    [
      "powerhouse",
      "generate-editor",
      "--name",
      name,
      "--root-dir",
      dir,
      "--document-types",
      documentTypes.join(","),
      "--document-types-map",
      JSON.stringify(documentTypesMap),
      "--document-models-dir",
      documentModelsDir,
    ],
    { skipFormat },
  );
}

export async function generateProcessor(
  name: string,
  documentTypes: string[],
  documentTypesMap: DocumentTypesMap,
  dir: string,
  documentModelsDir: string,
  type = "analytics",
  { skipFormat = false } = {},
) {
  // Generate the singular files for the document model logic
  const processorType = type === "operational" ? "operational" : "analytics";
  await run(
    [
      "powerhouse",
      `generate-processor-${processorType}`,
      "--name",
      name,
      "--pascalName",
      pascalCase(name),
      "--root-dir",
      dir,
      "--document-types",
      documentTypes.join(","),
      "--document-types-map",
      JSON.stringify(documentTypesMap),
      "--document-models-dir",
      documentModelsDir,
    ],
    { skipFormat },
  );
}

export async function generateSubgraph(
  name: string,
  dir: string,
  { skipFormat = false } = {},
) {
  // Generate the singular files for the document model logic
  await run(
    [
      "powerhouse",
      `generate-subgraph`,
      "--name",
      name,
      "--pascalName",
      pascalCase(name),
      "--root-dir",
      dir,
    ],
    { skipFormat },
  );
}

export async function generateImportScript(
  name: string,
  dir: string,
  { skipFormat = false } = {},
) {
  // Generate the singular files for the document model logic
  await run(
    [
      "powerhouse",
      `generate-import-script`,
      "--name",
      name,
      "--pascalName",
      pascalCase(name),
      "--root-dir",
      dir,
    ],
    { skipFormat },
  );
}
