import type { PowerhouseConfig } from "@powerhousedao/config";
import { paramCase, pascalCase } from "change-case";
import type { DocumentModelGlobalState } from "document-model";
import { Logger, runner } from "hygen";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPackage } from "read-pkg";
import { TSMorphCodeGenerator } from "../ts-morph-generator/index.js";
import { makeEditorModuleFile } from "../ts-morph-utils/file-builders/document-editor.js";
import { makeDocumentModelModulesFile } from "../ts-morph-utils/file-builders/document-model.js";
import { makeSubgraphsIndexFile } from "../ts-morph-utils/file-builders/subgraphs.js";
import { buildTsMorphProject } from "../ts-morph-utils/ts-morph-project.js";
import type { CodegenOptions, DocumentTypesMap } from "./types.js";
import { loadDocumentModel } from "./utils.js";

const require = createRequire(import.meta.url);

const __dirname =
  import.meta.dirname || path.dirname(fileURLToPath(import.meta.url));
const defaultTemplates = path.join(__dirname, ".hygen", "templates");

export async function run(
  args: string[],
  { watch = false, skipFormat = false, verbose = true } = {},
) {
  // Create logger that respects verbose setting
  const logFunction = verbose ? console.log.bind(console) : () => {};
  const logger = new Logger(logFunction);

  const result = await runner(args, {
    templates: defaultTemplates,
    cwd: process.cwd(),
    logger,
    createPrompter: () => {
      return require("enquirer");
    },
    exec: (action, body) => {
      const opts = body && body.length > 0 ? { input: body } : {};
      return require("execa").shell(action, opts);
    },
    debug: !!process.env.DEBUG,
  });
  if (!skipFormat) {
    const prettier = await import("prettier");
    const fs = await import("fs/promises");
    const actions = result.actions as { status: string; subject: string }[];

    const filesToFormat = actions
      .filter((action) => ["added", "inject"].includes(action.status))
      .map((action) => action.subject.replace("./", `${process.cwd()}/`))
      .map((filePath) =>
        filePath.startsWith(process.cwd())
          ? filePath
          : `${process.cwd()}/${filePath}`,
      );

    if (filesToFormat.length > 0) {
      const config = await prettier.resolveConfig(process.cwd());

      await Promise.all(
        filesToFormat.map(async (filePath) => {
          try {
            const text = await fs.readFile(filePath, "utf8");
            const formatted = await prettier.format(text, {
              ...config,
              filepath: filePath,
            });
            await fs.writeFile(filePath, formatted);
          } catch (err: unknown) {
            if (verbose) {
              console.log(err);
            }
          }
        }),
      );
    }
  }

  return result;
}

export async function generateAll(
  dir: string,
  { watch = false, skipFormat = false, verbose = true, force = true } = {},
) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  const documentModelStates: DocumentModelGlobalState[] = [];

  for (const directory of files.filter((f) => f.isDirectory())) {
    const documentModelPath = path.join(
      dir,
      directory.name,
      `${directory.name}.json`,
    );
    if (!fs.existsSync(documentModelPath)) {
      continue;
    }

    const packageName = await readPackage().then((pkg) => pkg.name);

    try {
      const documentModel = await loadDocumentModel(documentModelPath);
      documentModelStates.push(documentModel);
      await hygenGenerateDocumentModel(documentModel, dir, packageName, {
        watch,
        skipFormat,
        verbose,
        generateReducers: false,
        force,
      });
    } catch (error) {
      if (verbose) {
        console.error(directory.name, error);
      }
    }
  }

  const projectDir = path.dirname(dir);
  const documentModelDir = path.basename(dir);
  const packageName = await readPackage().then((pkg) => pkg.name);

  const generator = new TSMorphCodeGenerator(
    projectDir,
    documentModelStates,
    packageName,
    {
      directories: { documentModelDir },
      forceUpdate: force,
    },
  );

  await generator.generateReducers();
}

export async function hygenGenerateDocumentModel(
  documentModelState: DocumentModelGlobalState,
  dir: string,
  packageName: string,
  {
    watch = false,
    skipFormat = false,
    verbose = true,
    generateReducers = true,
    force = true,
  } = {},
) {
  const projectDir = path.dirname(dir);
  const documentModelDir = path.basename(dir);

  // Generate the singular files for the document model logic
  await run(
    [
      "powerhouse",
      "generate-document-model",
      "--document-model",
      JSON.stringify(documentModelState),
      "--root-dir",
      dir,
      "--package-name",
      packageName,
    ],
    { watch, skipFormat, verbose },
  );

  const latestSpec =
    documentModelState.specifications[
      documentModelState.specifications.length - 1
    ];

  // Generate the module-specific files for the document model logic
  for (const module of latestSpec.modules) {
    await run(
      [
        "powerhouse",
        "generate-document-model-module",
        "--document-model",
        JSON.stringify(documentModelState),
        "--root-dir",
        dir,
        "--module",
        module.name,
        "--package-name",
        packageName,
      ],
      { watch, skipFormat, verbose },
    );
  }

  if (generateReducers) {
    const generator = new TSMorphCodeGenerator(
      projectDir,
      [documentModelState],
      packageName,
      { directories: { documentModelDir }, forceUpdate: force },
    );

    await generator.generateReducers();
  }

  const project = buildTsMorphProject(projectDir);
  makeDocumentModelModulesFile({
    project,
    projectDir,
  });
}

type HygenGenerateEditorArgs = {
  name: string;
  documentTypes: string[];
  documentTypesMap: DocumentTypesMap;
  dir: string;
  documentModelsDir: string;
  packageName: string;
  skipFormat?: boolean;
  verbose?: boolean;
  editorId?: string;
  editorDirName?: string;
};
export async function hygenGenerateEditor(
  hygenGenerateEditorArgs: HygenGenerateEditorArgs,
) {
  const {
    name,
    documentTypes,
    documentTypesMap,
    dir,
    documentModelsDir,
    packageName,
    skipFormat = false,
    verbose = true,
    editorId,
    editorDirName,
  } = hygenGenerateEditorArgs;
  // Generate the singular files for the document model logic
  const args = [
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
    "--package-name",
    packageName,
  ];

  if (editorId) {
    args.push("--editor-id", editorId);
  }

  if (editorDirName) {
    args.push("--editor-dir-name", editorDirName);
  }

  await run(args, { skipFormat, verbose });
  const projectDir = path.dirname(dir);
  const project = buildTsMorphProject(projectDir);

  makeEditorModuleFile({
    project,
    editorName: name,
    editorModuleFilePath: editorDirName || paramCase(name),
    editorId: editorId || paramCase(name),
    legacyMultipleDocumentTypes: documentTypes,
  });
}

export async function hygenGenerateProcessor(
  name: string,
  documentTypes: string[],
  outDir: string,
  type: "analytics" | "relationalDb",
  { skipFormat = false, verbose = true } = {},
) {
  // Generate the singular files for the document model logic
  const processorType = type === "relationalDb" ? "relationalDb" : "analytics";
  await run(
    [
      "powerhouse",
      `generate-processor-${processorType}`,
      "--name",
      name,
      "--pascalName",
      pascalCase(name),
      "--root-dir",
      outDir,
      "--document-types",
      documentTypes.join(","),
    ],
    { skipFormat, verbose },
  );
}

export async function hygenGenerateSubgraph(
  name: string,
  documentModel: DocumentModelGlobalState | null,
  config?: PowerhouseConfig & CodegenOptions,
) {
  const dir = config?.subgraphsDir || "";
  const packageName = await readPackage().then((pkg) => pkg.name);
  const skipFormat = config?.skipFormat || false;
  const verbose = config?.verbose || false;
  const params = [
    "powerhouse",
    `generate-subgraph`,
    "--name",
    name,
    "--pascalName",
    pascalCase(name),
    "--root-dir",
    dir,
    "--package-name",
    packageName,
  ];

  if (documentModel) {
    params.push("--loadFromFile", "1");
  }

  // Generate the singular files for the document model logic
  await run(params, { skipFormat, verbose });

  if (documentModel) {
    // Generate the GraphQL mutation schemas
    await run(
      [
        "powerhouse",
        "generate-document-model-subgraph",
        "--subgraph",
        name,
        "--document-model",
        JSON.stringify(documentModel),
        "--root-dir",
        dir,
        "--package-name",
        packageName,
      ],
      { skipFormat, verbose },
    );
  } else {
    await run(
      [
        "powerhouse",
        "generate-custom-subgraph",
        "--subgraph",
        name,
        "--root-dir",
        dir,
        "--package-name",
        packageName,
      ],
      { skipFormat, verbose },
    );
  }

  makeSubgraphsIndexFile({ projectDir: path.dirname(dir) });
}

export async function hygenGenerateImportScript(
  name: string,
  dir: string,
  { skipFormat = false, verbose = true } = {},
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
    { skipFormat, verbose },
  );
}

export async function hygenGenerateDriveEditor(options: {
  name: string;
  dir: string;
  appId: string;
  allowedDocumentTypes: string | undefined | null;
  isDragAndDropEnabled: boolean;
  skipFormat?: boolean;
  driveEditorDirName?: string;
}) {
  const {
    name,
    dir,
    appId,
    skipFormat,
    allowedDocumentTypes,
    isDragAndDropEnabled,
    driveEditorDirName,
  } = options;

  const allowedDocumentTypesString = JSON.stringify(
    allowedDocumentTypes && allowedDocumentTypes.length > 0
      ? allowedDocumentTypes.split(",")
      : [],
  );

  // Generate the drive editor files
  const args = [
    "powerhouse",
    "generate-drive-editor",
    "--name",
    name,
    "--root-dir",
    dir,
    "--app-id",
    appId,
    "--allowed-document-types",
    allowedDocumentTypesString,
    "--is-drag-and-drop-enabled",
    isDragAndDropEnabled ? "true" : "false",
  ];

  if (driveEditorDirName) {
    args.push("--drive-editor-dir-name", driveEditorDirName);
  }

  await run(args, { skipFormat });

  const projectDir = path.dirname(dir);
  const project = buildTsMorphProject(projectDir);

  makeEditorModuleFile({
    project,
    editorName: name,
    editorModuleFilePath: driveEditorDirName || paramCase(name),
    editorId: appId || paramCase(name),
    documentModelId: "powerhouse/document-drive",
  });
}
