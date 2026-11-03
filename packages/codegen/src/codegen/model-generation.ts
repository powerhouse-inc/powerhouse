import { POWERHOUSE_CONFIG_FILE } from "@powerhousedao/shared/clis";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isPlainObject } from "remeda";
import { projectPath } from "../utils/source-files.js";
import {
  DEFAULT_AUTHORING_MODE,
  parseDefinitionSourcesConfig,
  type AuthoringMode,
} from "@powerhousedao/shared/clis/definition-sources";
import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import type { Project } from "ts-morph";
import type {
  CodeFirstGenerationResult,
  GenerateCodeFirstDocumentModelArgs,
} from "../file-builders/document-model/code-first-model.js";
import { codeFirstModelGeneration } from "./code-first-generation.js";
import {
  schemaFirstModelGeneration,
  schemaFirstModelSource,
} from "./schema-first/model-generation.js";

/** @experimental The project root and optional authoring-mode override. */
export type ModelGenerationInput = {
  readonly projectDir: string;
  readonly codeFirst?: boolean;
};

/** @experimental */
export type GenerateEditorRequest = {
  readonly editorName: string;

  readonly documentTypes: string[];
  readonly editorId?: string;
  readonly editorDirName?: string;
};

/** @experimental */
export type GeneratedDocumentModels = {
  readonly documentModels: DocumentModelGlobalState[];

  readonly unreadableDirs: string[];
  readonly codeFirstDocumentModels: readonly {
    readonly id: string;
    readonly name: string;
  }[];
};

/** @experimental */
export type GeneratedEditors = {
  readonly editors: {
    name: string;
    id: string;
    dirName: string;
    documentTypes: string[];
  }[];
  readonly unreadableDirs: string[];
};

/**
 * @experimental Document-model and editor generation for one authoring mode.
 * The caller saves the project afterwards.
 */
export type ModelGeneration = {
  readonly mode: AuthoringMode;
  generateDocumentModel(
    state: DocumentModelGlobalState,
    project: Project,
  ): Promise<void>;
  generateAllDocumentModels(project: Project): Promise<GeneratedDocumentModels>;
  generateEditor(
    request: GenerateEditorRequest,
    project: Project,
  ): Promise<void>;
  generateAllEditors(project: Project): Promise<GeneratedEditors>;
  generateAll(project: Project): Promise<void>;
};

/** @experimental Today's generation, unchanged. */
export type SchemaFirstModelGeneration = ModelGeneration & {
  readonly mode: "schema-first";
};

/**
 * @experimental Generation in a package whose models are code-first. A
 * schema-first model in the same package still generates.
 */
export type CodeFirstModelGeneration = ModelGeneration & {
  readonly mode: "code-first";
  scaffoldDocumentModel(
    args: GenerateCodeFirstDocumentModelArgs,
    project: Project,
  ): Promise<CodeFirstGenerationResult>;
};

/**
 * @experimental The one place codegen decides the authoring mode. `codeFirst`
 * wins, then the config's `definitionSources.mode`, then
 * `DEFAULT_AUTHORING_MODE`. Call it once per command and pass the result down.
 */
export function selectModelGeneration(
  input: ModelGenerationInput & { readonly codeFirst: true },
): CodeFirstModelGeneration;
export function selectModelGeneration(
  input: ModelGenerationInput,
): SchemaFirstModelGeneration | CodeFirstModelGeneration;
export function selectModelGeneration(
  input: ModelGenerationInput,
): SchemaFirstModelGeneration | CodeFirstModelGeneration {
  const definitionSources = readDefinitionSources(input.projectDir);
  switch (authoringModeOf(input.codeFirst, definitionSources)) {
    case "schema-first":
      return schemaFirstModelGeneration;
    case "code-first":
      return codeFirstModelGeneration(schemaFirstModelSource);
  }
}

function authoringModeOf(
  codeFirst: boolean | undefined,
  definitionSources: unknown,
): AuthoringMode {
  if (codeFirst === true) return "code-first";
  const parsed = parseDefinitionSourcesConfig(definitionSources);
  if (parsed.ok) return parsed.mode;
  if (parsed.reason === "missing") return DEFAULT_AUTHORING_MODE;
  throw new Error(
    `powerhouse.config.json has an invalid ${parsed.path.join(".")} (received ${JSON.stringify(parsed.received)}). Fix or remove it, then generate again.`,
  );
}

function readDefinitionSources(projectDir: string): unknown {
  const configFile = join(projectDir, POWERHOUSE_CONFIG_FILE);
  if (!existsSync(configFile)) return undefined;
  let config: unknown;
  try {
    config = JSON.parse(readFileSync(configFile, "utf8"));
  } catch (cause) {
    throw new Error(
      `Cannot read ${configFile}. Fix its JSON before generating.`,
      { cause },
    );
  }
  if (!isPlainObject(config))
    throw new Error(`${configFile} must hold a JSON object.`);
  return config.definitionSources;
}

export function projectModelGeneration(project: Project) {
  return selectModelGeneration({
    projectDir: projectPath(project, "."),
  });
}
