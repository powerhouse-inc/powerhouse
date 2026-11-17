import {
  assertDocumentModelBarrelsWritable,
  type DocumentModelMigration,
  type DocumentModelMigrationFile,
  type DocumentModelMigrationReference,
  migrateDocumentModel,
  regenerateDocumentModelBarrels,
} from "@powerhousedao/codegen";
import { documentModelsDirOf } from "@powerhousedao/codegen/utils";
import type {
  DocumentModelDefinition,
  DocumentModelModuleDefinition,
  DocumentModelOperationDefinition,
  DocumentModelSpecificationDefinition,
  StateDefinition,
} from "@powerhousedao/shared/document-model";
import {
  discoverDocumentModelDirectories,
  inspectProjectDefinitions,
} from "document-model/tooling";
import { statSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { outdatedDependency } from "./installed-version.js";
import { unifiedDiff } from "./migrate-subgraphs.js";
import { readProjectDefinitions } from "./model/project.js";
import { projectModuleReferences } from "./project-module-references.js";
import {
  assertChangesWritable,
  errorText,
  type FileBackup,
  readProjectFiles,
  restoreChanges,
  toPosix,
  writeChanges,
} from "./project-files.js";

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|json|graphql)$/;
export type MigrateDocumentModelsOptions = {
  readonly projectDir: string;
  /** Model directories to convert; empty converts every schema-first one. */
  readonly dirs: readonly string[];
  readonly dryRun: boolean;
  /** Renames a type named like a scalar instead of refusing its model. */
  readonly renameConflictingTypes?: boolean;
  readonly out?: (text: string) => void;
};

type Definitions = ReadonlyMap<number, unknown>;

/**
 * `ph migrate --document-models`: converts schema-first document models into
 * code-first ones. Each converted model is loaded again as `ph model inspect`
 * loads it, and every version must keep the definition it had: the same
 * state, operations, inputs and errors. Otherwise its files are restored.
 * Returns the exit code: 0 when every requested model converted or was
 * already code-first, 1 otherwise.
 */
export async function migrateDocumentModels(
  options: MigrateDocumentModelsOptions,
): Promise<0 | 1> {
  const out =
    options.out ?? ((text: string) => void process.stdout.write(text));
  const { projectDir } = options;
  let resolved: { readonly path: string };
  try {
    resolved = documentModelsDirOf(projectDir);
  } catch (error) {
    out(`${errorText(error)}\n`);
    return 1;
  }
  const modelsDir = toPosix(relative(projectDir, resolved.path));
  const directories = new Map(
    discoverDocumentModelDirectories(projectDir, resolved.path).directories.map(
      (directory) => [directory.name, directory.kind] as const,
    ),
  );
  let failed = false;
  const requested: string[] = [];
  if (options.dirs.length === 0) {
    for (const [name, kind] of directories) {
      if (kind === "stored") requested.push(name);
    }
  }
  for (const dir of options.dirs) {
    const name = basename(dir.replace(/[\\/]+$/, ""));
    // A path names a directory of the models directory, not any directory.
    if (
      /[\\/]/.test(dir.replace(/[\\/]+$/, "")) &&
      resolve(projectDir, dir, "..") !== resolved.path
    ) {
      out(
        `${dir}: not a directory of ${modelsDir}/. Name a model directory, such as ${modelsDir}/${name}.\n`,
      );
      failed = true;
      continue;
    }
    if (!requested.includes(name)) requested.push(name);
  }
  if (requested.length === 0 && !failed) {
    out("No schema-first document models to convert.\n");
    return 0;
  }

  const pending: string[] = [];
  for (const dirName of requested) {
    const label = `${modelsDir}/${dirName}`;
    const kind = directories.get(dirName);
    if (kind === undefined || kind === "none" || kind === "invalid") {
      out(
        `${label}: not found. Name a directory of ${modelsDir}/ that holds a document model.\n`,
      );
      failed = true;
    } else if (kind === "module") {
      out(`${label}: already code-first\n`);
    } else if (kind === "generated") {
      out(
        `${label}: not converted. It has generated code but no ${dirName}.json, so its specification cannot be read. Restore ${dirName}.json, then migrate again.\n`,
      );
      failed = true;
    } else {
      pending.push(dirName);
    }
  }
  if (pending.length === 0) return failed ? 1 : 0;
  // The barrels are regenerated after the models are written, so a barrel
  // codegen would refuse to rewrite stops the run before anything changes.
  try {
    assertChangesWritable(projectDir, [
      { path: "document-models/index.ts" },
      { path: "document-models/document-models.ts" },
      { path: "document-models/upgrade-manifests.ts" },
      { path: "powerhouse.manifest.json" },
    ]);
    assertDocumentModelBarrelsWritable(projectDir);
  } catch (error) {
    out(`No document model was converted. ${errorText(error)}\n`);
    return 1;
  }

  let moduleReferences: readonly DocumentModelMigrationReference[];
  try {
    moduleReferences = projectModuleReferences(projectDir).map((reference) => ({
      file: reference.file,
      specifier: reference.specifier,
      targets: reference.targets
        .filter((target) =>
          statSync(resolve(projectDir, target.path), {
            throwIfNoEntry: false,
          })?.isFile(),
        )
        .map((target) => target.path),
    }));
  } catch (error) {
    out(`No document model was converted. ${errorText(error)}\n`);
    return 1;
  }
  const outdated = outdatedDependency(projectDir, "document-model");
  const run: ModelRun = {
    projectDir,
    modelsDir,
    pending,
    renameConflictingTypes: options.renameConflictingTypes ?? false,
    moduleReferences,
    out,
  };
  if (options.dryRun) {
    if (outdated !== undefined) {
      out(`Note: ${outdated} Until then, a real run converts nothing.\n`);
    }
    return (await previewModels(run)) || failed ? 1 : 0;
  }
  if (outdated !== undefined) {
    out(`No document model was converted. ${outdated}\n`);
    return 1;
  }
  return (await convertModels(run)) || failed ? 1 : 0;
}

type ModelRun = {
  readonly moduleReferences: readonly DocumentModelMigrationReference[];
  readonly projectDir: string;
  readonly modelsDir: string;
  readonly pending: readonly string[];
  readonly renameConflictingTypes: boolean;
  readonly out: (text: string) => void;
};

/** `--dry-run`: prints what each conversion would write. Returns whether one was refused. */
async function previewModels(run: ModelRun): Promise<boolean> {
  const { out } = run;
  let files = readSourceTexts(run.projectDir);
  let refused = false;
  const notes = new Set<string>();
  for (const dirName of run.pending) {
    const label = `${run.modelsDir}/${dirName}`;
    let migration: DocumentModelMigration;
    try {
      migration = await migrateDocumentModel({
        documentModelsDir: run.modelsDir,
        dirName,
        files,
        moduleReferences: run.moduleReferences,
        renameConflictingTypes: run.renameConflictingTypes,
      });
      if (migration.kind === "converted") {
        assertChangesWritable(run.projectDir, migration.files);
      }
    } catch (error) {
      out(
        `${label}: would not convert. The conversion failed unexpectedly: ${errorText(error)}\n`,
      );
      refused = true;
      continue;
    }
    if (migration.kind !== "converted") {
      out(`${label}: ${refusalText(migration)}\n`);
      refused = true;
      continue;
    }
    out(
      `${label}: would convert ${migration.documentType} (versions ${migration.versions.join(", ")}) to code-first, if the converted model keeps its definition when loaded\n`,
    );
    for (const file of migration.files) out(fileDiff(file));
    for (const note of migration.notes) notes.add(note);
    files = applied(files, migration.files);
  }
  for (const note of notes) out(`Note: ${note}\n`);
  return refused;
}

/**
 * Converts each model, writes it, loads it again and keeps it only when every
 * version has its stored definition; then regenerates the barrels. Returns
 * whether a model was not converted.
 */
async function convertModels(run: ModelRun): Promise<boolean> {
  const { projectDir, out } = run;
  let files = readSourceTexts(projectDir);
  const before = await storedDefinitions(
    projectDir,
    run.modelsDir,
    run.pending,
    files,
  );
  let failed = false;
  const converted = new Set<string>();
  const notes = new Set<string>();
  for (const dirName of run.pending) {
    const label = `${run.modelsDir}/${dirName}`;
    let outcome: ModelOutcome;
    try {
      outcome = await convertModel(run, dirName, files, before);
    } catch (error) {
      outcome = {
        ok: false,
        text: `not converted; its files are unchanged. The conversion failed unexpectedly: ${errorText(error)}`,
      };
    }
    if (!outcome.ok) {
      out(`${label}: ${outcome.text}\n`);
      failed = true;
      continue;
    }
    const { migration } = outcome;
    files = applied(files, migration.files);
    out(
      `${label}: converted ${migration.documentType} (versions ${migration.versions.join(", ")}) to code-first; every version keeps its definition\n`,
    );
    for (const note of migration.notes) notes.add(note);
    converted.add(dirName);
  }
  for (const note of notes) out(`Note: ${note}\n`);
  if (converted.size > 0) {
    try {
      const changed = await regenerateDocumentModelBarrels(
        projectDir,
        converted,
      );
      if (changed.length > 0) {
        out(`Regenerated ${changed.join(", ")}.\n`);
      }
    } catch (error) {
      out(
        `The converted models are written, but the document-models barrels could not be regenerated: ${errorText(error)}\nFix that, then run ph generate.\n`,
      );
      failed = true;
    }
  }
  return failed;
}

type ModelOutcome =
  | {
      readonly ok: true;
      readonly migration: Extract<
        DocumentModelMigration,
        { kind: "converted" }
      >;
    }
  | { readonly ok: false; readonly text: string };

/** Converts, writes and verifies one model, restoring its files when it fails. */
async function convertModel(
  run: ModelRun,
  dirName: string,
  files: ReadonlyMap<string, string>,
  before: StoredDefinitions,
): Promise<ModelOutcome> {
  const migration = await migrateDocumentModel({
    documentModelsDir: run.modelsDir,
    dirName,
    files,
    moduleReferences: run.moduleReferences,
    renameConflictingTypes: run.renameConflictingTypes,
  });
  if (migration.kind !== "converted") {
    return { ok: false, text: refusalText(migration) };
  }
  const stored = before.definitions.get(dirName);
  const unread = migration.versions.filter(
    (version) => stored?.has(version) !== true,
  );
  if (stored === undefined || unread.length > 0) {
    return {
      ok: false,
      text: `not converted. Version ${unread.join(", ")} of its stored definition could not be read, so the conversion could not be checked. Run ph model check to see why.`,
    };
  }
  let backup: FileBackup;
  try {
    backup = writeChanges(run.projectDir, migration.files);
  } catch (error) {
    return {
      ok: false,
      text: `not converted; its files are restored. Writing them failed: ${errorText(error)}`,
    };
  }
  let verification: Awaited<ReturnType<typeof verify>>;
  try {
    verification = await verify(
      run.projectDir,
      migration.documentType,
      renameTypes(stored, migration.renamedTypes),
      before.known,
    );
  } catch (error) {
    verification = {
      ok: false,
      reason: `Checking the converted model failed: ${errorText(error)}`,
    };
  }
  if (!verification.ok) {
    restoreChanges(run.projectDir, backup);
    return {
      ok: false,
      text: `not converted; its files are restored. ${verification.reason}`,
    };
  }
  return { ok: true, migration };
}

/** The package's source files as text, by project-relative POSIX path. */
function readSourceTexts(projectDir: string): Map<string, string> {
  return new Map(
    [...readProjectFiles(projectDir, SOURCE_FILE)].map(([path, bytes]) => [
      path,
      bytes.toString("utf8"),
    ]),
  );
}

function applied(
  files: ReadonlyMap<string, string>,
  changes: readonly DocumentModelMigrationFile[],
): Map<string, string> {
  const next = new Map(files);
  for (const file of changes) {
    if (file.after === null) next.delete(file.path);
    else next.set(file.path, file.after);
  }
  return next;
}

type StoredDefinitions = {
  readonly definitions: ReadonlyMap<string, Definitions>;
  /** The errors the project reported before anything was written. */
  readonly known: ReadonlySet<string>;
};

/** The stored versions of each model, read before anything is written. */
async function storedDefinitions(
  projectDir: string,
  modelsDir: string,
  dirNames: readonly string[],
  files: ReadonlyMap<string, string>,
): Promise<StoredDefinitions> {
  const wanted = dirNames.flatMap((dirName) => {
    const text = files.get(`${modelsDir}/${dirName}/${dirName}.json`);
    if (text === undefined) return [];
    try {
      const stored = JSON.parse(text) as {
        id: string;
        specifications: { version: number }[];
      };
      return [
        {
          dirName,
          documentType: stored.id,
          versions: stored.specifications.map(({ version }) => version),
        },
      ];
    } catch {
      // The migration refuses a specification that is not JSON, and says why.
      return [];
    }
  });
  return await readProjectDefinitions(projectDir, (project) => {
    const result = new Map<string, Definitions>();
    const known = new Set<string>();
    for (const { dirName, documentType, versions } of wanted) {
      const definitions = new Map<number, unknown>();
      for (const version of versions) {
        const report = inspectProjectDefinitions(project, {
          selection: { documentType, version },
        });
        if ("definition" in report) definitions.set(version, report.definition);
        for (const message of errorMessages(report.diagnostics)) {
          known.add(message);
        }
      }
      result.set(dirName, definitions);
    }
    return { definitions: result, known };
  });
}

function errorMessages(
  diagnostics: readonly {
    readonly severity: string;
    readonly message: string;
    readonly repair?: string;
  }[],
): string[] {
  return diagnostics
    .filter(({ severity }) => severity === "error")
    .map(({ message, repair }) => `${message} ${repair ?? ""}`.trim());
}

type Verification =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/**
 * The stored definitions with the types the conversion renamed off a
 * scalar's name renamed too, so the comparison expects the new names. The
 * stored definition also lists the scalar the type's name collided with,
 * which the converted model no longer names.
 */
function renameTypes(
  definitions: Definitions,
  renamed: readonly { version: number; from: string; to: string }[],
): Definitions {
  if (renamed.length === 0) return definitions;
  const result = new Map<number, unknown>();
  for (const [version, definition] of definitions) {
    const names = new Map(
      renamed
        .filter((entry) => entry.version === version)
        .map(({ from, to }) => [from, to] as const),
    );
    // A type is named by `name` in its definition and in every reference;
    // unions and interfaces list members and implemented types by name.
    const walk = (value: unknown, key?: string): unknown => {
      if (key === "scalars" && Array.isArray(value)) {
        return value.filter(
          (scalar) =>
            !(
              isRecord(scalar) &&
              typeof scalar.name === "string" &&
              names.has(scalar.name)
            ),
        );
      }
      if (Array.isArray(value)) {
        return value.map((item) =>
          (key === "members" || key === "implements") &&
          typeof item === "string"
            ? (names.get(item) ?? item)
            : walk(item),
        );
      }
      if (!isRecord(value)) return value;
      return Object.fromEntries(
        Object.entries(value).map(([entryKey, entry]) => [
          entryKey,
          entryKey === "name" &&
          typeof entry === "string" &&
          typeof value.kind === "string"
            ? (names.get(entry) ?? entry)
            : walk(entry, entryKey),
        ]),
      );
    };
    result.set(version, walk(definition));
  }
  return result;
}

/** Loads the converted model and compares each version with its stored definition. */
async function verify(
  projectDir: string,
  documentType: string,
  expected: Definitions,
  known: ReadonlySet<string>,
): Promise<Verification> {
  let actual: ReadonlyMap<number, unknown>;
  let problems: readonly string[];
  try {
    [actual, problems] = await readProjectDefinitions(projectDir, (project) => {
      const definitions = new Map<number, unknown>();
      const errors: string[] = [];
      for (const version of expected.keys()) {
        const report = inspectProjectDefinitions(project, {
          selection: { documentType, version },
        });
        if ("definition" in report) definitions.set(version, report.definition);
        for (const message of errorMessages(report.diagnostics)) {
          // Errors the project had before, such as another model's, are not this conversion's.
          if (!known.has(message)) errors.push(message);
        }
      }
      return [definitions, errors] as const;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `The converted model does not load: ${message.replaceAll(projectDir, ".")}`,
    };
  }
  if (problems.length > 0) {
    return {
      ok: false,
      reason: `The converted model does not pass ph model check:\n${[...new Set(problems)].map((problem) => `  ${problem}`).join("\n")}`,
    };
  }
  for (const [version, stored] of expected) {
    const converted = actual.get(version);
    if (converted === undefined) {
      return {
        ok: false,
        reason: `The converted model exports no version ${version} of ${documentType}.`,
      };
    }
    const differences = definitionDifferences(stored, converted);
    if (differences.length > 0) {
      return {
        ok: false,
        reason: `Version ${version} of the converted model has a different definition:\n${differences
          .slice(0, 20)
          .map((line) => `  ${line}`)
          .join("\n")}`,
      };
    }
  }
  return { ok: true };
}

/**
 * What a stored definition and the code-first one differ in. IDs, the
 * stored names of modules and operations, the reducer and template text, and
 * the GraphQL text a schema-first model keeps derive from the authoring
 * style, so they are not compared. The model, every named type (operation
 * inputs included), the state roots and initial values, and each operation's
 * key, action type, scope, input and errors are.
 */
export function definitionDifferences(
  stored: unknown,
  converted: unknown,
): string[] {
  const differences: string[] = [];
  const walk = (left: unknown, right: unknown, path: string) => {
    if (differences.length >= 50) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) {
        differences.push(
          `${path}: ${left.length} entries stored, ${right.length} converted`,
        );
      }
      for (
        let index = 0;
        index < Math.min(left.length, right.length);
        index++
      ) {
        walk(left[index], right[index], `${path}[${index}]`);
      }
      return;
    }
    if (isRecord(left) && isRecord(right)) {
      for (const key of new Set([
        ...Object.keys(left),
        ...Object.keys(right),
      ])) {
        walk(left[key], right[key], path === "" ? key : `${path}.${key}`);
      }
      return;
    }
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      differences.push(
        `${path}: stored ${JSON.stringify(left)}, converted ${JSON.stringify(right)}`,
      );
    }
  };
  walk(canonical(stored), canonical(converted), "");
  return differences;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The records of a list, or none when it is not one. */
function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** Empty text and null both mean "none" in a stored model. */
const text = (value: unknown): unknown => (value === "" ? null : value);

/** Members whose empty text means none, as the stored format writes it. */
const TEXT_KEYS = new Set(["description", "deprecated", "template"]);

/** `value` with empty text read as none, and without `keys`, at any depth. */
function normalized(value: unknown, keys: readonly string[] = []): unknown {
  if (Array.isArray(value)) return value.map((item) => normalized(item, keys));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !keys.includes(key))
      .map(([key, entry]) => [
        key,
        TEXT_KEYS.has(key) ? text(entry) : normalized(entry, keys),
      ]),
  );
}

/**
 * How one member of a definition is compared: `ignore` leaves it out, a
 * function maps it to what is compared. The tables are exhaustive over the
 * definition types, so a member added to them must be classified here; a
 * member the loaded definition has and a table lacks is compared as is.
 */
type Rule = "ignore" | ((value: unknown) => unknown);
type Rules<T> = { readonly [Key in keyof Required<T>]: Rule };

const same = (value: unknown) => normalized(value);
const exampleValues = (value: unknown) =>
  records(value).map((example) => example.value);

function compared<T>(value: unknown, rules: Rules<T>): unknown {
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const rule = (rules as Readonly<Record<string, Rule | undefined>>)[key];
    if (rule === "ignore") continue;
    result[key] = (rule ?? same)(entry);
  }
  return result;
}

const STATE_RULES: Rules<StateDefinition> = {
  root: same,
  initialValue: (value) => value ?? {},
  examples: exampleValues,
  unknownKeys: same,
  // The GraphQL and JSON text the state is materialized from.
  materialized: "ignore",
};

const OPERATION_RULES: Rules<DocumentModelOperationDefinition> = {
  id: "ignore",
  // The stored operation name; the key and action type derive from it.
  name: "ignore",
  key: same,
  description: text,
  actionType: same,
  creatorKey: same,
  scope: same,
  // Compared among the specification's types.
  input: (value) => (isRecord(value) ? value.name : null),
  errors: (value) => normalized(value, ["id", "key"]),
  examples: exampleValues,
  template: "ignore",
  reducer: "ignore",
};

const MODULE_RULES: Rules<DocumentModelModuleDefinition> = {
  id: "ignore",
  // The stored module name; the key derives from it.
  name: "ignore",
  key: same,
  description: text,
  operations: (value) =>
    records(value).map((operation) => compared(operation, OPERATION_RULES)),
};

/** The named types of a specification, operation inputs included, by name. */
function namedTypes(specification: Record<string, unknown>): unknown {
  const types = new Map<string, unknown>();
  const add = (type: unknown) => {
    if (isRecord(type) && typeof type.name === "string") {
      types.set(type.name, normalized(type, ["key"]));
    }
  };
  for (const type of records(specification.types)) add(type);
  for (const module of records(specification.modules)) {
    for (const operation of records(module.operations)) add(operation.input);
  }
  return Object.fromEntries(
    [...types].sort(([left], [right]) => left.localeCompare(right)),
  );
}

const SPECIFICATION_RULES: Rules<DocumentModelSpecificationDefinition> = {
  version: same,
  changeLog: same,
  scalars: same,
  // The GraphQL text a schema-first model keeps.
  graphQLCompatibility: "ignore",
  types: "ignore",
  state: (value) =>
    isRecord(value)
      ? {
          global: compared(value.global, STATE_RULES),
          local: compared(value.local, STATE_RULES),
        }
      : value,
  modules: (value) =>
    records(value).map((module) => compared(module, MODULE_RULES)),
};

const DEFINITION_RULES: Rules<DocumentModelDefinition> = {
  kind: same,
  formatVersion: same,
  // How identities and serialization derive differs by authoring style.
  compatibility: (value) =>
    isRecord(value) ? { scalarCoercion: value.scalarCoercion } : value,
  model: same,
  specifications: (value) =>
    records(value).map((specification) => {
      const result = compared(specification, SPECIFICATION_RULES);
      return isRecord(result)
        ? { ...result, types: namedTypes(specification) }
        : result;
    }),
};

/** The parts of a definition both authoring styles must agree on. */
function canonical(definition: unknown): unknown {
  return compared(definition, DEFINITION_RULES);
}

function fileDiff(file: DocumentModelMigrationFile): string {
  if (file.after === null)
    return `--- a/${file.path}\n+++ /dev/null\n(deleted)\n`;
  return unifiedDiff({
    path: file.path,
    before: file.before,
    after: file.after,
  });
}

function refusalText(
  migration: Extract<DocumentModelMigration, { kind: "refused" }>,
): string {
  return `not converted\n${migration.refusals
    .map(
      ({ file, line, reason, repair }) =>
        `  ${file}${line === undefined ? "" : `:${line}`}: ${reason}\n    ${repair}`,
    )
    .join("\n")}`;
}
