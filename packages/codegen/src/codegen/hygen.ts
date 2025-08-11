import { pascalCase } from "change-case";
import { type DocumentModelState } from "document-model";
import { Logger, runner } from "hygen";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TSMorphCodeGenerator } from "../ts-morph-generator/core/TSMorphCodeGenerator.js";
import { type DocumentTypesMap } from "./index.js";
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
          if (verbose) {
            console.log(err);
          }
        });
      });
  }

  return result;
}

export async function generateAll(
  dir: string,
  { watch = false, skipFormat = false, verbose = true, force = true } = {},
) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  const documentModelStates: DocumentModelState[] = [];

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
      documentModelStates.push(documentModel);
      await generateDocumentModel(documentModel, dir, {
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

  const generator = new TSMorphCodeGenerator(projectDir, documentModelStates, {
    directories: { documentModelDir },
    forceUpdate: force,
  });

  await generator.generateReducers();
}

export async function generateDocumentModel(
  documentModelState: DocumentModelState,
  dir: string,
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
      ],
      { watch, skipFormat, verbose },
    );
  }

  if (generateReducers) {
    const generator = new TSMorphCodeGenerator(
      projectDir,
      [documentModelState],
      { directories: { documentModelDir }, forceUpdate: force },
    );

    await generator.generateReducers();
  }
}

export async function generateEditor(
  name: string,
  documentTypes: string[],
  documentTypesMap: DocumentTypesMap,
  dir: string,
  documentModelsDir: string,
  { skipFormat = false, verbose = true } = {},
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
    { skipFormat, verbose },
  );
}

export async function generateProcessor(
  name: string,
  documentTypes: string[],
  documentTypesMap: DocumentTypesMap,
  outDir: string,
  documentModelsDir: string,
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
      "--document-types-map",
      JSON.stringify(documentTypesMap),
      "--document-models-dir",
      documentModelsDir,
    ],
    { skipFormat, verbose },
  );
}

export async function generateSubgraph(
  name: string,
  documentModel: DocumentModelState | null,
  dir: string,
  { skipFormat = false, verbose = true } = {},
) {
  const params = [
    "powerhouse",
    `generate-subgraph`,
    "--name",
    name,
    "--pascalName",
    pascalCase(name),
    "--root-dir",
    dir,
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
      ],
      { skipFormat, verbose },
    );
  }
}

export async function generateImportScript(
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

export async function generateDriveEditor(
  name: string,
  dir: string,
  { skipFormat = false } = {},
) {
  // Generate the drive editor files
  await run(
    ["powerhouse", "generate-drive-editor", "--name", name, "--root-dir", dir],
    { skipFormat },
  );
}
