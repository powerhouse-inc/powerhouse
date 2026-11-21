import { camelCase, pascalCase } from "change-case";
import { Kind } from "graphql";
import { posix } from "node:path";
import {
  ModuleKind,
  ModuleResolutionKind,
  Node,
  Project,
  QuoteKind,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import {
  codeFirstIndexTemplate,
  type CodeFirstDocumentModelTemplateArgs,
  codeFirstUpgradesTemplate,
  codeFirstVersionTemplate,
} from "../templates/code-first/document-model.js";
import { formatFileText } from "../utils/format-with-prettier.js";
import {
  compatFileText,
  errorsFileText,
  MODEL_UTILS,
} from "./document-model-migration/compat.js";
import {
  CODE_FILE,
  checkMovedSource,
  type DocumentModelMigration,
  type DocumentModelMigrationFile,
  type DocumentModelMigrationReference,
  exportedNames,
  GENERATED_HEADER,
  type Input,
  literal,
  type ModulePlan,
  refuse,
  Refused,
  sourceFile,
  unwrapExpression,
  type VersionContext,
} from "./document-model-migration/context.js";
import { definitionFileText } from "./document-model-migration/definition.js";
import { valueImportNames } from "./subgraph-migration/source-imports.js";
import { importBindings } from "./migration-ast.js";
import {
  compatValueImport,
  importedModelNames,
  rebaseText,
  type Removal,
  replaced,
  resolveSpecifier,
  rewriteImports,
  runsNothing,
  specifierFor,
  type Unresolved,
  WHOLE,
  withoutUnusedImports,
} from "./document-model-migration/imports.js";
import {
  moduleFileText,
  planInputHomes,
  reducerFiles,
} from "./document-model-migration/modules.js";
import {
  checkOperationNames,
  declaredTypes,
  readModel,
} from "./document-model-migration/stored-model.js";

export type {
  DocumentModelMigration,
  DocumentModelMigrationFile,
  DocumentModelMigrationRefusal,
  DocumentModelMigrationReference,
} from "./document-model-migration/context.js";

/**
 * @experimental Converts the schema-first document model in
 * `<documentModelsDir>/<dirName>/` into a code-first one: a `definition.ts`,
 * one module file per module that keeps each reducer's body, and a family
 * that materializes every version. Each version's `index.ts` keeps exporting
 * the names the generated code exported, derived from the declarations, and
 * imports of deleted generated files anywhere in `files` are rewritten.
 * `files` holds the project's source files by project-relative path.
 * Nothing is read from or written to disk.
 */
export async function migrateDocumentModel(options: {
  /** Project-relative, without `./`, such as `document-models`. */
  readonly documentModelsDir: string;
  readonly dirName: string;
  readonly files: ReadonlyMap<string, string>;
  /** Hosts with project aliases or package mappings supply their resolutions, checked before replacing targets. */
  readonly moduleReferences?: readonly DocumentModelMigrationReference[];
  /** Renames a type named like a scalar instead of refusing the model. */
  readonly renameConflictingTypes?: boolean;
}): Promise<DocumentModelMigration> {
  const modelsDir = options.documentModelsDir
    .replace(/^\.\//, "")
    .replace(/\/$/, "");
  const packageName = packageNameOf(options.files.get("package.json"));
  const input: Input = {
    files: new Map(options.files),
    moduleReferences: options.moduleReferences ?? [],
    modelsDir,
    aliases: [
      "document-models",
      ...(packageName === undefined ? [] : [`${packageName}/${modelsDir}`]),
    ],
    dirName: options.dirName,
    renameConflictingTypes: options.renameConflictingTypes ?? false,
  };
  try {
    return await convert(input, options.files);
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
    return {
      kind: "refused",
      dirName: options.dirName,
      refusals: error.refusals,
    };
  }
}

/** The `name` of a package.json, which the package imports itself by. */
function packageNameOf(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  try {
    const { name } = JSON.parse(text) as { name?: unknown };
    return typeof name === "string" && name !== "" ? name : undefined;
  } catch {
    return undefined;
  }
}

async function convert(
  input: Input,
  original: ReadonlyMap<string, string>,
): Promise<DocumentModelMigration> {
  const root = `${input.modelsDir}/${input.dirName}`;
  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: { quoteKind: QuoteKind.Double },
    compilerOptions: {
      moduleResolution: ModuleResolutionKind.Bundler,
      module: ModuleKind.ESNext,
      baseUrl: "/",
      paths: Object.fromEntries(
        input.aliases.map((alias) => [`${alias}/*`, [`/${input.modelsDir}/*`]]),
      ),
      // Custom code may be JavaScript. Without allowJs it stays out of the
      // program, and reading a symbol inside one of its class bodies throws.
      allowJs: true,
    },
  });
  for (const [path, text] of input.files) {
    if (path.startsWith(`${root}/`) && /\.tsx?$/.test(path)) {
      project.createSourceFile(`/${path}`, text);
    }
  }
  const specFile = `${root}/${input.dirName}.json`;
  const model = readModel(input, specFile);
  const versions = model.specifications.map(({ version }) => version);
  const modulePath = `${root}/v${versions[0]}/module.ts`;
  const modelPascal =
    (input.files.has(modulePath)
      ? sourceFile(project, input, modulePath)
          .getVariableStatements()
          .find((statement) => statement.isExported())
          ?.getDeclarations()[0]
          ?.getName()
      : undefined) ?? pascalCase(model.name);
  const modelCamel = camelCase(modelPascal);
  const graphQLName = pascalCase(model.name);
  const imported = importedModelNames(project, input, root);
  const templateArgs: CodeFirstDocumentModelTemplateArgs = {
    displayName: model.name,
    pascalName: modelPascal,
    camelName: modelCamel,
    kebabName: input.dirName,
    documentType: model.id,
    author: {
      name: model.author?.name ?? "",
      website: model.author?.website ?? null,
    },
  };
  const notes: string[] = [];
  const renamedTypes: { version: number; from: string; to: string }[] = [];
  const latest = versions.at(-1)!;
  const manifestName = `${modelCamel}UpgradeManifest`;
  const compatIndex = (version: number) =>
    `${root}/compat/v${version}/index.ts`;
  const compatSchema = (version: number) =>
    `${root}/compat/v${version}/schema.ts`;
  /** Old paths whose content goes away or moves, and where it went. */
  const removals = new Map<string, Removal>([[specFile, replaced()]]);
  /** New files the migration writes; it formats them. */
  const written = new Map<string, string>();
  /** Kept, moved and module files, at their new paths: their imports are rewritten. */
  const rewritten = new Map<string, string>();
  /** Each name a version's compatibility files export, and the file that defines it. */
  const compatNames = new Map<number, ReadonlyMap<string, string>>();

  for (const version of versions.slice(1)) {
    const path = `${root}/upgrades/v${version}.ts`;
    if (!input.files.has(path)) {
      refuse(
        path,
        1,
        `Version ${version} has no upgrade transition in upgrades/v${version}.ts.`,
        "Run ph generate to scaffold the transition, implement it, then migrate again.",
      );
    }
    if (!exportedNames(sourceFile(project, input, path)).has(`v${version}`)) {
      refuse(
        path,
        1,
        `upgrades/v${version}.ts exports no transition named v${version}.`,
        `Export the transition into version ${version} as v${version}.`,
      );
    }
  }

  for (const specification of model.specifications) {
    const version = specification.version;
    const dir = `${root}/v${version}`;
    for (const path of input.files.keys()) {
      if (path.startsWith(`${dir}/src/`) && CODE_FILE.test(path)) {
        checkMovedSource(sourceFile(project, input, path), path);
      }
    }
    if (!input.files.has(`${dir}/gen/index.ts`)) {
      refuse(
        `${dir}/gen/index.ts`,
        1,
        `Version ${version} has no generated code in ${dir}/gen.`,
        "Run ph generate (or ph migrate to update an unversioned layout) so every version has its generated code, then migrate again.",
      );
    }
    const { types, renamed } = declaredTypes(specification, specFile, {
      enabled: input.renameConflictingTypes,
      prefix: graphQLName,
    });
    for (const [from, to] of renamed) {
      renamedTypes.push({ version, from, to });
      notes.push(
        `Version ${version}: the GraphQL type ${from} is now ${to}, because ${from} is a scalar's name. Queries that name it, such as fragments on it, need the new name; its TypeScript name in compat/v${version} stays ${from}.`,
      );
    }
    const globalRoot = `${graphQLName}State`;
    const localRoot =
      specification.state.local.schema.trim() === ""
        ? undefined
        : `${graphQLName}LocalState`;
    for (const rootName of [globalRoot, localRoot]) {
      if (rootName === undefined) continue;
      const declared = types.get(rootName);
      if (declared?.node.kind !== Kind.OBJECT_TYPE_DEFINITION) {
        refuse(
          specFile,
          undefined,
          `Version ${version} declares no object type ${rootName}, the state root the model's name derives.`,
          `Name the state type ${rootName}.`,
        );
      }
    }
    checkOperationNames(specFile, specification, types);
    const context: VersionContext = {
      input,
      project,
      specification,
      version,
      dir,
      specFile,
      model,
      modelPascal,
      modelCamel,
      types,
      globalRoot,
      localRoot,
      renamed,
      errorsNeeded: new Set(),
      inputHomes: new Map(),
      notes,
    };

    // A class another file imports stays a class.
    const byBinding = reducerFiles(project, input, dir);
    const reducerPaths = new Set(byBinding.values());
    for (const [path, text] of input.files) {
      if (
        !CODE_FILE.test(path) ||
        path.startsWith(`${dir}/gen/`) ||
        reducerPaths.has(path) ||
        !text.includes("error")
      ) {
        continue;
      }
      const file = sourceFile(project, input, path);
      for (const declaration of file.getImportDeclarations()) {
        const target = resolveSpecifier(
          input.files,
          input,
          path,
          declaration.getModuleSpecifierValue(),
        );
        if (
          target === undefined ||
          !target.startsWith(`${dir}/gen/`) ||
          !target.endsWith("/error.ts")
        ) {
          continue;
        }
        for (const named of declaration.getNamedImports()) {
          context.errorsNeeded.add(named.getName());
        }
      }
    }

    const takenFiles = new Set<string>();
    const plans: ModulePlan[] = specification.modules.map((module) => {
      const pascal = pascalCase(module.name);
      const binding = `${modelCamel}${pascal}Operations`;
      const reducerFile = byBinding.get(binding);
      const base =
        reducerFile === undefined
          ? module.name.replace(/[^\w-]+/g, "-").toLowerCase()
          : posix.basename(reducerFile, ".ts");
      let fileName = base;
      for (let suffix = 2; takenFiles.has(fileName); suffix++) {
        fileName = `${base}-${suffix}`;
      }
      takenFiles.add(fileName);
      return {
        stored: module,
        key: camelCase(module.name),
        pascal,
        constName: `${modelCamel}${pascal}`,
        path: `${dir}/modules/${fileName}.ts`,
        reducerFile,
      };
    });
    if (new Set(plans.map((plan) => plan.key)).size !== plans.length) {
      refuse(
        specFile,
        undefined,
        `Two modules of version ${version} derive the same key.`,
        "Rename one of the modules.",
      );
    }

    planInputHomes(context, plans);
    written.set(`${dir}/definition.ts`, definitionFileText(context));
    // The code-first runtime does not fill a default; GraphQL does.
    for (const [name, { node }] of context.types) {
      if (node.kind !== Kind.INPUT_OBJECT_TYPE_DEFINITION) continue;
      for (const field of node.fields ?? []) {
        if (
          field.type.kind !== Kind.NON_NULL_TYPE ||
          field.defaultValue === undefined
        ) {
          continue;
        }
        context.notes.push(
          `Version ${version}: ${name}.${field.name.value} has a default, so a code-first caller may omit it, and the reducer then receives undefined rather than the default. A reducer that reads it as always set no longer type-checks; handle the missing value there.`,
        );
      }
    }

    for (const plan of plans) {
      if (input.files.has(plan.path)) {
        refuse(
          plan.path,
          1,
          `${plan.path} already exists.`,
          "Move the file away, then migrate again.",
        );
      }
      const { text, helpers } = moduleFileText(context, plan);
      written.set(plan.path, text);
      rewritten.set(plan.path, text);
      if (plan.reducerFile !== undefined) {
        removals.set(plan.reducerFile, replaced(helpers));
      }
    }

    written.set(
      `${dir}/index.ts`,
      codeFirstVersionTemplate(
        templateArgs,
        version,
        plans.map((plan) => ({
          constName: plan.constName,
          file: posix.basename(plan.path, ".ts"),
        })),
      ),
    );

    // The custom code of src/ moves beside the definition; src/index.ts,
    // which only re-exports it, and the hooks join the compatibility names.
    const reserved = (path: string) =>
      [`${dir}/definition.ts`, `${dir}/index.ts`, `${dir}/errors.ts`].includes(
        path,
      ) || path.startsWith(`${dir}/modules/`);
    /** Generated files of the version root, which the migration removes. */
    const deletedLater = (path: string) =>
      path.startsWith(`${dir}/gen/`) ||
      GENERATED_VERSION_FILES.some((name) => path === `${dir}/${name}`);
    const taken = (path: string) =>
      reserved(path) ||
      (input.files.has(path) &&
        !path.startsWith(`${dir}/src/`) &&
        !deletedLater(path)) ||
      [...removals.values()].some(
        (removal) => removal.kind === "moved" && removal.to === path,
      ) ||
      written.has(path);
    // A suffix goes before the whole extension, so x.test.ts stays a test.
    const free = (path: string) => {
      const base = posix.basename(path);
      const dot = base.indexOf(".");
      const stem = dot === -1 ? base : base.slice(0, dot);
      const extension = dot === -1 ? "" : base.slice(dot);
      let next = path;
      for (let suffix = 2; taken(next); suffix++) {
        next = `${posix.dirname(path)}/${stem}-${suffix}${extension}`;
      }
      return next;
    };
    const move = (from: string, to: string) => {
      if (CODE_FILE.test(from)) {
        checkMovedSource(sourceFile(project, input, from), from);
      }
      removals.set(from, { kind: "moved", to });
      const text = input.files.get(from)!;
      rewritten.set(
        to,
        CODE_FILE.test(from)
          ? rebaseText(text.replace(GENERATED_HEADER, ""), from, to)
          : text,
      );
    };
    const customUtilsPath = `${dir}/src/utils.ts`;
    if (input.files.has(customUtilsPath)) {
      const overrides = [
        ...exportedNames(sourceFile(project, input, customUtilsPath)).keys(),
      ].filter((name) => MODEL_UTILS.has(name));
      if (overrides.length > 0) {
        refuse(
          customUtilsPath,
          1,
          `${customUtilsPath} exports ${overrides.join(", ")}, which replace the generated utils of version ${version}. A code-first model cannot replace its utils, so hosts would stop using them.`,
          `Rename ${overrides.join(", ")} so they add to the utils instead of replacing one, and call them where you need them, then migrate again.`,
        );
      }
    }
    const customIndex = `${dir}/src/index.ts`;
    // The generated barrels loaded src/utils.ts and src/index.ts, and what
    // they import, with the model; afterwards only compat/v<N> loads them.
    // Code they run at load would stop running with the model, unless a
    // reducer, which stays loaded, imports it too.
    const keptLoaded = customLoads(
      project,
      input,
      root,
      dir,
      [
        ...plans.flatMap(({ reducerFile }) => reducerFile ?? []),
        // The upgrade transitions stay loaded with the model too.
        ...[...input.files.keys()].filter(
          (path) =>
            /^v\d+\.ts$/.test(posix.basename(path)) &&
            posix.dirname(path) === `${root}/upgrades`,
        ),
      ],
      true,
    );
    for (const path of customLoads(project, input, root, dir, [
      customUtilsPath,
      customIndex,
    ])) {
      if (keptLoaded.has(path)) continue;
      const statement = loadTimeStatement(sourceFile(project, input, path));
      if (statement !== undefined) {
        refuse(
          path,
          statement.getStartLineNumber(),
          `${path} runs code when it loads. The generated code of version ${version} loaded it with the model; after the migration only compat/v${version} loads it, so that code would no longer run when the model loads.`,
          "Move the code into a reducer or a function the host calls, or import the file from a reducer, then migrate again.",
        );
      }
    }
    const customNames = input.files.has(customIndex)
      ? [...exportedNames(sourceFile(project, input, customIndex)).keys()]
      : [];
    for (const path of [...input.files.keys()]) {
      // Reducer files became modules; anything else under src/ moves.
      if (!path.startsWith(`${dir}/src/`) || removals.has(path)) continue;
      if (path === customIndex) {
        move(path, `${root}/compat/v${version}/custom.ts`);
        continue;
      }
      move(path, free(`${dir}/${path.slice(`${dir}/src/`.length)}`));
    }
    const hooksPath = `${dir}/hooks.ts`;
    const hooksNames = input.files.has(hooksPath)
      ? [...exportedNames(sourceFile(project, input, hooksPath)).keys()]
      : [];
    if (input.files.has(hooksPath)) {
      move(hooksPath, `${root}/compat/v${version}/hooks.ts`);
    }

    // Generated files go; the names they exported move to the compatibility
    // barrel, and the error classes still needed to errors.ts.
    const generated = [...input.files.keys()].filter(
      (path) =>
        path.startsWith(`${dir}/gen/`) ||
        [
          `${dir}/actions.ts`,
          `${dir}/module.ts`,
          `${dir}/utils.ts`,
          `${dir}/schema.graphql`,
        ].includes(path),
    );
    const legacyNames = new Map<string, Node>();
    for (const path of [
      `${dir}/gen/index.ts`,
      `${dir}/actions.ts`,
      `${dir}/module.ts`,
      `${dir}/utils.ts`,
    ]) {
      if (!input.files.has(path)) continue;
      for (const [name, node] of exportedNames(
        sourceFile(project, input, path),
      )) {
        legacyNames.set(name, node);
      }
    }
    const errors = errorsFileText(
      context,
      generated.filter((path) => /\/gen\/[^/]+\/error\.ts$/.test(path)),
    );
    if (errors !== undefined) written.set(`${dir}/errors.ts`, errors.text);

    const utilsRemoval = removals.get(`${dir}/src/utils.ts`);
    const customUtils =
      utilsRemoval?.kind === "moved" ? utilsRemoval.to : undefined;
    const compat = compatFileText(context, plans, legacyNames, {
      hooks: hooksNames.length > 0,
      custom: input.files.has(customIndex),
      customUtils:
        customUtils === undefined
          ? undefined
          : specifierFor(compatIndex(version), customUtils, "./x.js"),
      latestManifest: version === latest ? manifestName : undefined,
      imported,
    });
    written.set(compatIndex(version), compat.index);
    written.set(compatSchema(version), compat.schema);
    const exported = new Map<string, string>([
      ...[...compat.provides].map(
        ([name, home]) =>
          [
            name,
            home === "schema" ? compatSchema(version) : compatIndex(version),
          ] as const,
      ),
      ...[...hooksNames, ...customNames].map(
        (name) => [name, compatIndex(version)] as const,
      ),
    ]);
    compatNames.set(version, exported);
    const missing = [...legacyNames.keys()].filter(
      (name) => !exported.has(name),
    );
    if (missing.length > 0) {
      notes.push(
        `compat/v${version}/index.ts does not export ${missing.join(", ")}, which the generated code of version ${version} did.`,
      );
    }

    const oldBarrel = `${dir}/index.ts`;
    for (const path of [...generated, oldBarrel]) {
      const homes = new Map<string, string>();
      if (/\.tsx?$/.test(path) && input.files.has(path)) {
        for (const name of exportedNames(
          sourceFile(project, input, path),
        ).keys()) {
          if (errors?.names.has(name) && path.endsWith("/error.ts")) {
            homes.set(name, `${dir}/errors.ts`);
          } else if (exported.has(name)) {
            homes.set(name, exported.get(name)!);
          }
        }
        // compat/vN/index.ts re-exports everything the version's code exported.
        if (!path.endsWith("/error.ts")) homes.set(WHOLE, compatIndex(version));
      }
      removals.set(path, replaced(homes));
    }
  }

  // The model entry is the family, as code-first scaffolding writes it, and
  // the upgrades take the scaffold's form around the kept transitions.
  const rootIndex = `${root}/index.ts`;
  const upgradesIndex = `${root}/upgrades/index.ts`;
  const later = versions.slice(1);
  written.set(rootIndex, codeFirstIndexTemplate(templateArgs, versions));
  written.set(upgradesIndex, codeFirstUpgradesTemplate(templateArgs, versions));
  const familyNames = new Set([
    modelPascal,
    manifestName,
    ...versions.map((version) => `${modelPascal}V${version}`),
  ]);
  const latestNames = compatNames.get(latest)!;
  for (const path of [
    rootIndex,
    upgradesIndex,
    `${root}/upgrades/upgrade-manifest.ts`,
    `${root}/upgrades/versions.ts`,
  ]) {
    if (!input.files.has(path)) continue;
    const homes = new Map<string, string>();
    for (const name of exportedNames(sourceFile(project, input, path)).keys()) {
      const transition = /^v(\d+)$/.exec(name);
      if (transition !== null && later.includes(Number(transition[1]))) {
        homes.set(name, `${root}/upgrades/${name}.ts`);
      } else if (/UpgradeManifest$/.test(name)) {
        homes.set(name, path === rootIndex ? rootIndex : upgradesIndex);
      } else if (familyNames.has(name) && path === rootIndex) {
        homes.set(name, rootIndex);
      } else if (latestNames.has(name)) {
        homes.set(name, latestNames.get(name)!);
      }
    }
    removals.set(path, replaced(homes));
  }

  for (const reference of input.moduleReferences) {
    const expected = resolveSpecifier(
      original,
      input,
      reference.file,
      reference.specifier,
    );
    const { targets } = reference;
    if (
      !targets.some((target) => removals.has(target)) &&
      (expected === undefined || !removals.has(expected))
    )
      continue;
    if (
      expected === undefined ||
      targets.length === 0 ||
      targets.some((target) => target !== expected)
    ) {
      refuse(
        reference.file,
        undefined,
        `The static module reference ${literal(reference.specifier)} resolves to a file this migration replaces, but its project mapping cannot be rewritten safely.`,
        "Use a relative import to the original target before migrating, or keep this model schema-first.",
      );
    }
  }

  // A file the conversion writes replaces only a file it removes; any other
  // file at that path is the project's own.
  const occupied = [...written.keys()].filter(
    (path) => input.files.has(path) && !removals.has(path),
  );
  if (occupied.length > 0) {
    throw new Refused(
      occupied.map((path) => ({
        file: path,
        reason: `${path} exists, and the code-first model writes a file there.`,
        repair: "Rename or move the file, then migrate again.",
      })),
    );
  }
  for (const [path, text] of input.files) {
    if (!removals.has(path) && !written.has(path)) rewritten.set(path, text);
  }
  const unresolved = rewriteImports(rewritten, input, original, removals);
  if (unresolved.length > 0) {
    // One refusal per importing declaration, so every affected file is named.
    const byImport = new Map<string, Unresolved[]>();
    for (const entry of unresolved) {
      const key = `${entry.file}:${entry.line}:${entry.from}`;
      byImport.set(key, [...(byImport.get(key) ?? []), entry]);
    }
    throw new Refused(
      [...byImport.values()].map((entries) => {
        const {
          file,
          line,
          from,
          commonJs,
          mocked,
          unmocks,
          unfollowed,
          suffixed,
          sideEffect,
          encoded,
        } = entries[0];
        if (encoded) {
          return {
            file,
            line,
            reason: `${file} imports ${from}, which the migration moves or replaces, through a percent-encoded path, which it does not rewrite.`,
            repair:
              "Write the path without percent-encoding, then migrate again.",
          };
        }
        if (sideEffect) {
          return {
            file,
            line,
            reason: `${file} imports ${from} only for its side effects. The migration replaces that file and cannot preserve its initialization separately.`,
            repair:
              "Move the initialization into a helper file that the migration keeps, then import that helper instead.",
          };
        }
        if (suffixed) {
          return {
            file,
            line,
            reason: `${file} imports ${from}, which the migration replaces. Its query or fragment would apply to the file that replaces it, which holds different code.`,
            repair:
              "Import the module without the query or fragment, then migrate again.",
          };
        }
        if (unfollowed) {
          return {
            file,
            line,
            reason: `${file} names ${from} in a string the migration does not follow as a module name, such as a mock target held in a variable, passed through another call or written through a namespace. After the migration it would not name the file it names now.`,
            repair:
              "Name the module directly in an import, export, import() or a vi.mock, vi.doMock, vi.unmock or vi.doUnmock call (or vitest.* or jest.*, imported under any name), then migrate again.",
          };
        }
        if (mocked === "collides") {
          return {
            file,
            line,
            reason: `${file} ${unmocks ? "unmocks" : "mocks"} ${from}, and another mock or unmock in the package names a different module whose names move to the same file. A test runner keeps one mock per module, and a test's setup files and the test share them, so moving both could drop one.`,
            repair:
              "Mock or unmock the model's index.ts instead of its generated files, replacing every name the tests replace, then migrate again.",
          };
        }
        if (mocked === "unsafe") {
          return {
            file,
            line,
            reason: `${file} mocks ${from}, which the migration replaces. Its names move to a file that also holds other modules' names, or to more than one file, so moving the mock would change what other importers get.`,
            repair:
              "Write the factory as async (importOriginal) => ({ ...(await importOriginal()), name: ... }), replacing only names that module exports (or spread await vi.importActual or jest.requireActual of the same module, directly or through a const read nowhere else), then migrate again.",
          };
        }
        if (commonJs) {
          return {
            file,
            line,
            reason: `${file} loads ${from} with require. The migration removes that file, and the code-first model that provides its names now imports document-model, which has no entry require can load.`,
            repair:
              "Load the names with import from an ES module, or move what the file does into code the migration keeps, then migrate again.",
          };
        }
        return {
          file,
          line,
          reason: `${file} imports ${entries.map(({ name }) => name).join(", ")} from ${from}, which the migration removes and nothing else exports.`,
          repair:
            "Import the name from the model's compat/v<N>/index.ts, or move what it does into code the migration keeps, then migrate again.",
        };
      }),
    );
  }

  const after = new Map<string, string>();
  for (const [path, text] of written) after.set(path, text);
  for (const [path, text] of rewritten) after.set(path, text);
  const cycle = compatValueImport(after, input, root);
  if (cycle !== undefined) {
    refuse(
      cycle.file,
      cycle.line,
      `${cycle.file} uses ${cycle.name} from ${cycle.from} when it runs. That name now lives in the model's compat barrel, which reads the model, so a file the model loads cannot import it: the import would be a cycle.`,
      `Import ${cycle.name} only as a type, or take what it gives from the model's own files (its definition, or a helper beside it), then migrate again.`,
    );
  }
  const files: DocumentModelMigrationFile[] = [];
  for (const path of new Set([...original.keys(), ...after.keys()])) {
    const before = original.get(path) ?? null;
    const next = after.get(path) ?? null;
    if (before === next) continue;
    files.push({
      path,
      before,
      // Only the files the migration writes are formatted; a file whose
      // imports were rewritten keeps the project's formatting.
      after:
        next === null || !written.has(path)
          ? next
          : await formatFileText(
              posix.basename(path),
              withoutUnusedImports(project, path, next),
            ),
    });
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  // A code-first model stores each module and operation under the
  // PascalCase of its key; the action types stay.
  const renamedNames = model.specifications.flatMap((specification) =>
    specification.modules.flatMap((module) => [
      ...(pascalCase(camelCase(module.name)) === module.name
        ? []
        : [`${module.name} → ${pascalCase(camelCase(module.name))}`]),
      ...module.operations.flatMap((operation) =>
        pascalCase(camelCase(operation.name)) === operation.name
          ? []
          : [`${operation.name} → ${pascalCase(camelCase(operation.name))}`],
      ),
    ]),
  );
  if (renamedNames.length > 0) {
    notes.push(
      `The stored names of modules and operations now derive from their keys (${[...new Set(renamedNames)].slice(0, 3).join(", ")}${renamedNames.length > 3 ? ", …" : ""}); action types do not change, and the documentModel of compat/v<N> keeps the stored names for code that reads them.`,
    );
  }
  return {
    kind: "converted",
    dirName: input.dirName,
    documentType: model.id,
    versions,
    files,
    notes,
    renamedTypes,
  };
}

/**
 * The custom files that loading `starts` loads, following their value
 * imports and re-exports through `<dir>/src/` and project files outside the
 * model.
 */
function customLoads(
  project: Project,
  input: Input,
  root: string,
  dir: string,
  starts: readonly string[],
  /** Follow only imports a compiler keeps: bare, or read as a value. */
  keptOnly = false,
): Set<string> {
  const loaded = new Set<string>();
  const queue = [...starts];
  for (let path = queue.pop(); path !== undefined; path = queue.pop()) {
    if (loaded.has(path) || !input.files.has(path) || !CODE_FILE.test(path)) {
      continue;
    }
    loaded.add(path);
    const file = sourceFile(project, input, path);
    const values = keptOnly ? valueImportNames(file) : undefined;
    for (const declaration of [
      ...file.getImportDeclarations(),
      ...file.getExportDeclarations(),
    ]) {
      const specifier = declaration.getModuleSpecifierValue();
      if (declaration.isTypeOnly() || specifier === undefined) continue;
      if (
        values !== undefined &&
        Node.isImportDeclaration(declaration) &&
        declaration.getImportClause() !== undefined &&
        !importBindings(declaration).some(
          ({ local, isTypeOnly }) => !isTypeOnly && values.has(local.getText()),
        )
      ) {
        continue;
      }
      // A tsconfig path alias such as `scalars/*` usually maps to the same
      // path from the project root.
      const target =
        resolveSpecifier(input.files, input, path, specifier) ??
        (/^[./#]/.test(specifier)
          ? undefined
          : resolveSpecifier(input.files, input, "index.ts", `./${specifier}`));
      if (target !== undefined && !generatedModelFile(root, target)) {
        queue.push(target);
      }
    }
  }
  return loaded;
}

/** The files schema-first codegen generates in a version root besides index.ts and gen/. */
const GENERATED_VERSION_FILES = [
  "actions.ts",
  "module.ts",
  "utils.ts",
  "hooks.ts",
  "schema.graphql",
];

/**
 * Whether `path` is a file schema-first codegen generates for the model at
 * `root`, which the model keeps loading: its index.ts, the upgrade manifest
 * and transitions, and each version root's index.ts, generated files and
 * `gen/`. Anything else under the model, such as `src/`, `tests/` or a custom
 * setup file, is custom code.
 */
function generatedModelFile(root: string, path: string): boolean {
  if (!path.startsWith(`${root}/`)) return false;
  const inside = path.slice(root.length + 1);
  const version = /^v\d+\/(.+)$/.exec(inside)?.[1];
  if (version === undefined) {
    return (
      inside === "index.ts" ||
      /^upgrades\/(?:index|upgrade-manifest|versions|v\d+)\.ts$/.test(inside)
    );
  }
  return (
    version === "index.ts" ||
    version.startsWith("gen/") ||
    GENERATED_VERSION_FILES.includes(version)
  );
}

/** Built-in constructors whose instances hold data and run nothing observable. */
const DATA_CONSTRUCTORS = /^(?:Map|Set|WeakMap|WeakSet|Date|RegExp|URL)$/;

/**
 * The first top-level statement of `file` that runs code when it loads:
 * anything but imports, exports, declarations, and classes and variables
 * whose initializers, base and static members call nothing.
 */
function loadTimeStatement(file: SourceFile): Node | undefined {
  const calm = (node: Node | undefined): boolean => {
    if (node === undefined || runsNothing(node)) return true;
    const value = unwrapExpression(node);
    return (
      Node.isNewExpression(value) &&
      builtIn(value.getExpression().getText()) &&
      value.getArguments().every(literalData)
    );
  };
  /** A data constructor's name that no top-level declaration or import of `file` shadows. */
  const builtIn = (name: string) =>
    DATA_CONSTRUCTORS.test(name) &&
    file.getVariableDeclaration(name) === undefined &&
    file.getClass(name) === undefined &&
    file.getFunction(name) === undefined &&
    file.getEnum(name) === undefined &&
    !file
      .getImportDeclarations()
      .some((declaration) =>
        importBindings(declaration).some(
          ({ local }) => local.getText() === name,
        ),
      );
  // A constructor iterates or converts its argument, which runs the
  // argument's own code unless it is written out as data.
  const literalData = (node: Node): boolean => {
    const value = unwrapExpression(node);
    return Node.isArrayLiteralExpression(value)
      ? value
          .getElements()
          .every((element) => !Node.isSpreadElement(element) && calm(element))
      : Node.isStringLiteral(value) ||
          Node.isNoSubstitutionTemplateLiteral(value) ||
          Node.isNumericLiteral(value) ||
          Node.isRegularExpressionLiteral(value);
  };
  /** Computed keys and defaults in a destructuring pattern run when it is evaluated. */
  const calmBinding = (name: Node) =>
    name.getDescendantsOfKind(SyntaxKind.BindingElement).every((element) => {
      const key = element.getPropertyNameNode();
      return (
        calm(element.getInitializer()) &&
        (key === undefined ||
          !Node.isComputedPropertyName(key) ||
          calm(key.getExpression()))
      );
    });
  const outside = (specifier: string | undefined) =>
    specifier !== undefined && !/^\.\.?\//.test(specifier);
  return file.getStatements().find((statement) => {
    // An import of a module the migration does not follow, such as a
    // package or an import alias, that binds nothing exists only to run
    // that module; so does a re-export of all of it.
    if (Node.isImportDeclaration(statement)) {
      const clause = statement.getImportClause();
      return (
        outside(statement.getModuleSpecifierValue()) &&
        (clause === undefined ||
          (clause.getDefaultImport() === undefined &&
            clause.getNamespaceImport() === undefined &&
            clause.getNamedImports().length === 0))
      );
    }
    if (Node.isExportDeclaration(statement)) {
      return (
        outside(statement.getModuleSpecifierValue()) &&
        statement.getNamespaceExport() === undefined &&
        statement.getNamedExports().length === 0
      );
    }
    if (Node.isEnumDeclaration(statement)) {
      return !statement
        .getMembers()
        .every((member) => calm(member.getInitializer()));
    }
    if (
      Node.isInterfaceDeclaration(statement) ||
      Node.isTypeAliasDeclaration(statement) ||
      Node.isFunctionDeclaration(statement) ||
      Node.isEmptyStatement(statement)
    ) {
      return false;
    }
    if (Node.isModuleDeclaration(statement)) {
      return !statement.hasDeclareKeyword();
    }
    if (Node.isVariableStatement(statement)) {
      return !statement
        .getDeclarations()
        .every(
          (declaration) =>
            calm(declaration.getInitializer()) &&
            calmBinding(declaration.getNameNode()),
        );
    }
    if (Node.isExportAssignment(statement)) {
      return !calm(statement.getExpression());
    }
    if (Node.isClassDeclaration(statement)) {
      return (
        statement.getDecorators().length > 0 ||
        statement.getStaticBlocks().length > 0 ||
        !calm(statement.getExtends()?.getExpression()) ||
        statement.getMembers().some((member) => {
          if (!Node.isPropertyNamed(member)) return false;
          const name = member.getNameNode();
          return (
            Node.isComputedPropertyName(name) && !calm(name.getExpression())
          );
        }) ||
        !statement
          .getStaticProperties()
          .every(
            (member) =>
              !Node.isPropertyDeclaration(member) ||
              calm(member.getInitializer()),
          )
      );
    }
    return true;
  });
}
