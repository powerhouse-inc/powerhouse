import type { DefinitionPath } from "@powerhousedao/shared/document-model";
import {
  compileDocumentModelVersion,
  type CompiledDocumentModelVersion,
  type DocumentModelCompilationConfig,
  type ModuleDeclaration,
  type OperationDeclaration,
  type OperationErrorDeclaration,
  type OperationReducer,
  type ScopeDeclaration,
  type StateRootDescriptor,
} from "../compiler/compile.js";
import {
  deriveDocumentModelModuleNames,
  deriveDocumentModelNames,
  deriveOperationErrorClassName,
} from "../compiler/naming.js";
import { isTypeDescriptor } from "../dsl/descriptor-registry.js";
import type { InputDescriptor } from "../dsl/types.js";
import {
  rejectionReceived,
  snapshotDataRecord,
  snapshotRecord,
} from "../kernel/data-properties.js";
import { describeReceived } from "../kernel/diagnostics.js";
import { isAuthoredSchemaName, isNFC } from "../kernel/primitives.js";
import {
  type ModelCollector,
  modelCollector,
  normalizeExamples,
  optionalString,
  requiredString,
  requiredText,
  take,
  takeArray,
} from "./normalize.js";
import type {
  DocumentModelConfig,
  DocumentModelContext,
  DocumentModelVersionDefinition,
  ModelModuleToken,
  ModelOperationBuilder,
  ModelOperationToken,
} from "./types.js";

const moduleDeclarations = new WeakMap<
  ModelModuleToken,
  { readonly contextId: symbol; readonly declaration: ModuleDeclaration }
>();
const compiledVersions = new WeakMap<
  DocumentModelVersionDefinition,
  CompiledDocumentModelVersion
>();
export function compiledVersionOf(
  value: unknown,
): CompiledDocumentModelVersion | undefined {
  return value !== null && typeof value === "object"
    ? compiledVersions.get(value as DocumentModelVersionDefinition)
    : undefined;
}

function notExactEmptyObject(value: unknown): string | undefined {
  const otherPrototype = "an object whose prototype is not Object.prototype";
  const snapshot = snapshotRecord(value, [], []);
  if (!snapshot.ok) {
    if (snapshot.reason === "unknown-key") return "a nonempty object";
    if (snapshot.reason === "custom-prototype") return otherPrototype;
    return rejectionReceived(snapshot);
  }
  try {
    return Object.getPrototypeOf(value) === Object.prototype
      ? undefined
      : otherPrototype;
  } catch {
    return "inspection-failed";
  }
}

function stateRoot(
  collector: ModelCollector,
  candidate: unknown,
  expectedName: string,
  path: DefinitionPath,
): StateRootDescriptor | undefined {
  if (
    isTypeDescriptor(candidate) &&
    candidate.kind === "object" &&
    candidate.name === expectedName
  ) {
    return candidate as StateRootDescriptor;
  }
  collector.add({
    code: "PH-DM-STATE-ROOT-INVALID",
    path,
    message: `A state root must be a ph.object named ${expectedName}.`,
    expected: `ph.object(${JSON.stringify(expectedName)}, { fields: { ... } })`,
    received: isTypeDescriptor(candidate)
      ? `${candidate.kind} ${JSON.stringify(candidate.name)}`
      : candidate === undefined
        ? "absent"
        : describeReceived(candidate),
    repair: `Declare this scope as ph.object(${JSON.stringify(expectedName)}, { fields: { ... } }); the root name is derived from the model name.`,
  });
  return undefined;
}

const SCOPE_DECLARATION_KEYS = ["schema", "initialValue", "examples"];

function normalizeScope(
  collector: ModelCollector,
  value: unknown,
  scope: "global" | "local",
  expectedName: string,
): ScopeDeclaration | undefined {
  const path: DefinitionPath = ["scopes", scope];
  const declaration = take(
    collector,
    snapshotRecord(value, SCOPE_DECLARATION_KEYS, path),
    SCOPE_DECLARATION_KEYS,
  );
  if (declaration === undefined) return undefined;
  const examples = normalizeExamples(collector, declaration.examples, [
    ...path,
    "examples",
  ]);
  const initialValuePath = [...path, "initialValue"];
  if (scope === "local" && declaration.schema === null) {
    const refused = notExactEmptyObject(declaration.initialValue);
    if (refused === undefined)
      return { root: null, initialValue: {}, examples };
    collector.add({
      code: "PH-DM-INITIAL-VALUE-INVALID",
      path: initialValuePath,
      message:
        "An empty local scope requires an exact empty plain JSON object as its initial value.",
      expected: "{}",
      received: refused,
      repair: "Use local: { schema: null, initialValue: {} }.",
    });
    return undefined;
  }
  const root = stateRoot(collector, declaration.schema, expectedName, [
    ...path,
    "schema",
  ]);
  if (root === undefined) return undefined;
  const initialValue = snapshotDataRecord(
    declaration.initialValue,
    undefined,
    initialValuePath,
  );
  if (!initialValue.ok) {
    collector.add({
      code: "PH-DM-INITIAL-VALUE-INVALID",
      path: initialValue.path.map((segment) =>
        typeof segment === "number" ? segment : String(segment),
      ),
      message: "An initial value must contain only plain data properties.",
      expected: "a plain data object",
      received: rejectionReceived(initialValue),
      repair:
        "Use a plain object with enumerable string-keyed data properties.",
    });
    return undefined;
  }
  return { root, initialValue: initialValue.value, examples };
}

const CONFIG_KEYS = [
  "id",
  "name",
  "description",
  "extension",
  "version",
  "author",
  "changeLog",
  "scopes",
];
const SCOPE_MAP_KEYS = ["auxiliaryTypes", "global", "local"];

function rejectAuthorization(
  collector: ModelCollector,
  container: unknown,
  path: DefinitionPath,
): boolean {
  let keys: readonly string[] = [];
  try {
    if (container !== null && typeof container === "object") {
      keys = Object.getOwnPropertyNames(container);
    }
  } catch {
    // The snapshot reports an object that cannot be inspected.
  }
  if (!keys.includes("auth")) return false;
  collector.add({
    code: "PH-AUTH-UNSUPPORTED",
    path: [...path, "auth"],
    message:
      "A document model cannot declare authorization; core V1 rejects a model auth declaration.",
    expected: "no auth declaration",
    received: "auth",
    repair:
      "Remove the auth declaration. Platform authorization state and its runtime behavior are unchanged and stay outside the model declaration.",
  });
  return true;
}

function normalizeScopes(
  collector: ModelCollector,
  value: unknown,
  names: { readonly global: string; readonly local: string },
): DocumentModelCompilationConfig["scopes"] | undefined {
  const path: DefinitionPath = ["scopes"];
  const declaresAuth = rejectAuthorization(collector, value, path);
  const snapshot = snapshotRecord(value, SCOPE_MAP_KEYS, path, ["auth"]);
  if (!snapshot.ok && snapshot.reason === "unknown-key") {
    collector.add({
      code: "PH-DM-SCOPE-UNSUPPORTED",
      path: [...path, snapshot.key],
      message: `Scope ${JSON.stringify(snapshot.key)} cannot be declared; DocumentSpecification.state describes global and local only.`,
      expected: "global or local",
      received: snapshot.key,
      repair:
        "Remove the scope. auth, document, and header stay platform concerns, and runtime action scopes keep their current handling.",
    });
    return undefined;
  }
  const scopes = take(collector, snapshot, SCOPE_MAP_KEYS);
  if (scopes === undefined || declaresAuth) return undefined;

  const auxiliary =
    scopes.auxiliaryTypes === undefined
      ? []
      : (takeArray(collector, scopes.auxiliaryTypes, [
          ...path,
          "auxiliaryTypes",
        ]) ?? []);
  const auxiliaryTypes = auxiliary.flatMap((candidate, index) => {
    if (isTypeDescriptor(candidate)) return [candidate];
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "auxiliaryTypes", index],
      message:
        "An auxiliary type must be a named type created by a ph builder.",
      expected: "a named type descriptor",
      received: describeReceived(candidate),
      repair:
        "List descriptors returned by ph.enum, ph.object, ph.input, ph.interface, or ph.union.",
    });
    return [];
  });

  const global = normalizeScope(
    collector,
    scopes.global,
    "global",
    names.global,
  );
  const local = normalizeScope(collector, scopes.local, "local", names.local);
  if (global === undefined || global.root === null || local === undefined) {
    return undefined;
  }
  return { auxiliaryTypes, global: { ...global, root: global.root }, local };
}

function normalizeConfig(
  collector: ModelCollector,
  input: unknown,
): DocumentModelCompilationConfig | undefined {
  const declaresAuth = rejectAuthorization(collector, input, []);
  const config = take(
    collector,
    snapshotRecord(input, CONFIG_KEYS, [], ["auth"]),
    CONFIG_KEYS,
  );
  if (config === undefined || declaresAuth) return undefined;

  const id = requiredString(collector, config.id, ["id"]);
  const name = requiredString(collector, config.name, ["name"]);
  const description = requiredText(collector, config.description, [
    "description",
  ]);
  const extension = requiredString(collector, config.extension, ["extension"]);
  const version = config.version;
  const validVersion =
    typeof version === "number" && Number.isSafeInteger(version) && version > 0;
  if (!validVersion) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["version"],
      message: "A code-first model version must be a positive safe integer.",
      expected: "a positive safe integer",
      received:
        typeof version === "number"
          ? String(version)
          : describeReceived(version),
      repair: "Use version: 1, or the next integer for a later version.",
    });
  }
  const author = take(
    collector,
    snapshotRecord(config.author, ["name", "website"], ["author"]),
    ["name", "website"],
  );
  const authorName =
    author === undefined
      ? undefined
      : requiredString(collector, author.name, ["author", "name"]);
  const website =
    author === undefined
      ? null
      : optionalString(collector, author.website, ["author", "website"]);
  const changeLogEntries =
    config.changeLog === undefined
      ? []
      : (takeArray(collector, config.changeLog, ["changeLog"]) ?? []);
  const changeLog = changeLogEntries.flatMap((entry, index) => {
    const line = requiredString(collector, entry, ["changeLog", index]);
    return line === undefined ? [] : [line];
  });

  if (id === undefined || name === undefined) return undefined;
  const names = deriveDocumentModelNames({ id, name });
  const scopes = normalizeScopes(collector, config.scopes, {
    global: names.globalStateRootName,
    local: names.localStateRootName,
  });
  if (
    scopes === undefined ||
    description === undefined ||
    extension === undefined ||
    authorName === undefined ||
    website === undefined ||
    !validVersion
  ) {
    return undefined;
  }
  return {
    id,
    name,
    description,
    extension,
    version: version as number,
    author: { name: authorName, website },
    changeLog,
    names,
    scopes,
  };
}

const OPERATION_KEYS = [
  "description",
  "input",
  "errors",
  "examples",
  "template",
  "reducerTemplate",
  "reduce",
];
const ERROR_KEYS = ["code", "name", "description", "template"] as const;

function normalizeErrors(
  collector: ModelCollector,
  value: unknown,
  path: DefinitionPath,
): Readonly<Record<string, OperationErrorDeclaration>> {
  if (value === undefined) return {};
  const errors = take(collector, snapshotRecord(value, undefined, path), []);
  if (errors === undefined) return {};
  const normalized: Record<string, OperationErrorDeclaration> = {};
  for (const [key, declaration] of Object.entries(errors)) {
    const errorPath = [...path, key];
    if (key.length === 0 || !isNFC(key)) {
      collector.add({
        code: "PH-DM-IDENTITY-INVALID",
        path: errorPath,
        message:
          "An error key is an identity segment, so it must be a nonempty string already in Unicode NFC.",
        expected: "a nonempty NFC error key",
        received: key,
        repair: "Rewrite the error key in Unicode NFC.",
      });
      continue;
    }
    const className = deriveOperationErrorClassName(key);
    if (className !== key) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: errorPath,
        message: `Error key ${JSON.stringify(key)} derives the class name ${JSON.stringify(className)}, so the message a failed operation persists would differ from the schema-first equivalent.`,
        expected: className,
        received: key,
        repair: `Rename the error to ${JSON.stringify(className)}.`,
      });
      continue;
    }
    const metadata = take(
      collector,
      snapshotDataRecord(declaration, ERROR_KEYS, errorPath),
      ERROR_KEYS,
    );
    if (metadata === undefined) continue;
    const entry: Record<string, string | null> = {};
    let valid = true;
    for (const member of ERROR_KEYS) {
      if (!Object.hasOwn(metadata, member)) continue;
      const text = optionalString(collector, metadata[member], [
        ...errorPath,
        member,
      ]);
      if (text === undefined) valid = false;
      else entry[member] = text;
    }
    if (valid) normalized[key] = entry;
  }
  return normalized;
}

type OperationStage = {
  readonly declarations: Map<object, Omit<OperationDeclaration, "key">>;
  readonly rejected: Set<object>;
};

const builtTokens = new WeakSet<object>();

function operationBuilder<TState, TScope extends "global" | "local">(
  collector: ModelCollector,
  stage: OperationStage,
  scope: TScope,
): ModelOperationBuilder<TState, TScope> {
  return ((input: unknown) => {
    const token: ModelOperationToken = {
      kind: "powerhouse.document-model-operation",
    };
    builtTokens.add(token);
    const reject = () => {
      stage.rejected.add(token);
      return token;
    };
    const path: DefinitionPath = ["operations"];
    const config = take(
      collector,
      snapshotRecord(input, OPERATION_KEYS, path),
      OPERATION_KEYS,
    );
    if (config === undefined) return reject();
    const descriptor = config.input;
    if (!isTypeDescriptor(descriptor) || descriptor.kind !== "input") {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [...path, "input"],
        message: "An operation must declare a ph.input descriptor.",
        expected: "a ph.input descriptor",
        received: isTypeDescriptor(descriptor)
          ? descriptor.kind
          : descriptor === undefined
            ? "absent"
            : describeReceived(descriptor),
        repair:
          "Declare input: ph.input({ fields: { ... } }); an operation with no fields uses ph.input({ fields: {} }).",
      });
      return reject();
    }
    if (typeof config.reduce !== "function") {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [...path, "reduce"],
        message: "An operation must declare one reducer.",
        expected: "reduce(state, input, ctx)",
        received:
          config.reduce === undefined
            ? "absent"
            : describeReceived(config.reduce),
        repair: "Add reduce(state, input, ctx) to the operation declaration.",
      });
      return reject();
    }
    const text = (key: string) =>
      optionalString(collector, config[key], [...path, key]) ?? null;
    stage.declarations.set(token, {
      scope,
      input: descriptor as InputDescriptor,
      description: text("description"),
      errors: normalizeErrors(collector, config.errors, [...path, "errors"]),
      examples: normalizeExamples(collector, config.examples, [
        ...path,
        "examples",
      ]),
      template: text("template"),
      reducerTemplate: text("reducerTemplate"),
      reduce: config.reduce as OperationReducer,
    });
    return token;
  }) as ModelOperationBuilder<TState, TScope>;
}

function normalizeModuleKey(
  collector: ModelCollector,
  key: unknown,
): string | undefined {
  const path: DefinitionPath = ["modules", "key"];
  const moduleKey = requiredString(collector, key, path);
  if (moduleKey === undefined) return undefined;
  if (!isNFC(moduleKey)) {
    collector.add({
      code: "PH-DM-IDENTITY-INVALID",
      path,
      message:
        "A module key is an identity segment, so it must already be in Unicode NFC.",
      expected: "a module key in Unicode NFC",
      received: moduleKey,
      repair: "Rewrite the module key in Unicode NFC.",
    });
    return undefined;
  }
  const storedName = deriveDocumentModelModuleNames("", moduleKey).storedName;
  if (!isAuthoredSchemaName(storedName)) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path,
      message: `Module key ${JSON.stringify(moduleKey)} derives the invalid stored name ${JSON.stringify(storedName)}.`,
      expected: "a key whose derived stored name is a GraphQL name",
      received: moduleKey,
      repair: "Use a module key such as lineItems or line-items.",
    });
    return undefined;
  }
  return moduleKey;
}

function normalizeModule(
  collector: ModelCollector,
  key: unknown,
  config: unknown,
): ModuleDeclaration | undefined {
  const moduleKey = normalizeModuleKey(collector, key);
  const declaration = take(
    collector,
    snapshotRecord(config, ["description", "operations"], ["module"]),
    ["description", "operations"],
  );
  if (declaration === undefined || moduleKey === undefined) return undefined;
  const description = optionalString(collector, declaration.description, [
    "module",
    "description",
  ]);
  if (typeof declaration.operations !== "function") {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["module", "operations"],
      message: "Module operations must be declared by a callback.",
      expected: "operations: ({ global, local }) => ({ ... })",
      received:
        declaration.operations === undefined
          ? "absent"
          : describeReceived(declaration.operations),
      repair: "Use operations: ({ global, local }) => ({ ... }).",
    });
    return undefined;
  }
  const stage: OperationStage = {
    declarations: new Map(),
    rejected: new Set(),
  };
  const declared = (declaration.operations as (builders: object) => unknown)({
    global: operationBuilder(collector, stage, "global"),
    local: operationBuilder(collector, stage, "local"),
  });
  const operationMap = take(
    collector,
    snapshotRecord(declared, undefined, ["module", "operations"]),
    [],
  );
  if (operationMap === undefined) return undefined;
  const operations: OperationDeclaration[] = [];
  const seen = new Map<object, string>();
  for (const [operationKey, candidate] of Object.entries(operationMap)) {
    const path: DefinitionPath = ["module", "operations", operationKey];
    if (!isAuthoredSchemaName(operationKey) || !isNFC(operationKey)) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path,
        message: `Operation key ${JSON.stringify(operationKey)} must be a GraphQL name in Unicode NFC, because the action type, input type, and creator key derive from it.`,
        expected: "a GraphQL name such as addLineItem",
        received: operationKey,
        repair: "Rename the operation key.",
      });
      continue;
    }
    const token =
      candidate !== null && typeof candidate === "object"
        ? (candidate as ModelOperationToken)
        : undefined;
    const operation =
      token === undefined ? undefined : stage.declarations.get(token);
    if (token === undefined || operation === undefined) {
      if (token !== undefined && stage.rejected.has(token)) continue;
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path,
        message:
          "An operation entry must be the value this operations callback's global(...) or local(...) builder returned.",
        expected: "an operation token of this operations callback",
        received:
          token !== undefined && builtTokens.has(token)
            ? "an operation token this operations callback did not build"
            : describeReceived(candidate),
        repair:
          "Wrap the operation declaration with the scope builder the operations callback receives.",
      });
      continue;
    }
    const firstKey = seen.get(token);
    if (firstKey !== undefined) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path,
        message: `This operation token is already assigned to ${JSON.stringify(firstKey)}.`,
        expected: "one scope-builder call per operation",
        received: operationKey,
        repair: "Call the scope builder separately for each operation.",
        related: [
          {
            path: ["module", "operations", firstKey],
            message: "The token was first assigned here.",
          },
        ],
      });
      continue;
    }
    seen.set(token, operationKey);
    operations.push({ ...operation, key: operationKey });
  }
  return {
    key: moduleKey,
    description: description ?? null,
    operations,
  };
}

function versionModules(
  collector: ModelCollector,
  contextId: symbol,
  documentType: string,
  versionConfig: unknown,
): readonly ModuleDeclaration[] {
  const declaration = take(
    collector,
    snapshotRecord(versionConfig, ["modules"], ["version"]),
    ["modules"],
  );
  const modules =
    declaration === undefined
      ? undefined
      : takeArray(collector, declaration.modules, ["modules"]);
  if (modules === undefined) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["modules"],
      message: "A model version requires an array of module tokens.",
      expected: "modules: [oneModule, anotherModule]",
      received: "absent",
      repair: "Pass every module token of this version in one array.",
    });
    return [];
  }
  return modules.flatMap((module, index) => {
    const entry =
      module !== null && typeof module === "object"
        ? moduleDeclarations.get(module as ModelModuleToken)
        : undefined;
    if (entry?.contextId === contextId) return [entry.declaration];
    if (entry !== undefined) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: ["modules", index],
        message:
          "This module was created by a different document-model context.",
        expected: `a module of ${JSON.stringify(documentType)}`,
        received: "a module of another document-model context",
        repair:
          "Pass only the modules returned by this context's module() call; a same-shaped state type does not make another model's module this one's.",
      });
      return [];
    }
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["modules", index],
      message: "A version member is not a document-model module token.",
      expected: "a module token returned by context.module",
      received: describeReceived(module),
      repair: "Pass only the values returned by this context's module().",
    });
    return [];
  });
}

/**
 * @experimental Declares a document model version from `ph` descriptors.
 * The context's `module()` declares operations and `version()` compiles them
 * into a token for `materialize` or `defineDocumentModelFamily`.
 */
export function defineDocumentModel<
  const TGlobal extends StateRootDescriptor,
  const TLocal extends StateRootDescriptor | null,
  const TVersion extends number,
>(
  config: DocumentModelConfig<TGlobal, TLocal, TVersion>,
): DocumentModelContext<TGlobal, TLocal, TVersion> {
  const contextId = Symbol("powerhouse.document-model-context");
  const configCollector = modelCollector();
  const normalized = normalizeConfig(configCollector, config);
  configCollector.throwIfFailed();
  if (normalized === undefined) {
    throw new TypeError(
      "The document-model declaration could not be normalized.",
    );
  }
  const definitionRef = {
    kind: "document-model" as const,
    key: normalized.id,
    version: normalized.version,
  };

  return {
    module(key, moduleConfig) {
      const collector = modelCollector(definitionRef);
      const declaration = normalizeModule(collector, key, moduleConfig);
      collector.throwIfFailed();
      if (declaration === undefined) {
        throw new TypeError("The module declaration could not be normalized.");
      }
      const token = { kind: "powerhouse.document-model-module" } as const;
      moduleDeclarations.set(token, { contextId, declaration });
      return token;
    },
    version(versionConfig) {
      const collector = modelCollector(definitionRef);
      const modules = versionModules(
        collector,
        contextId,
        normalized.id,
        versionConfig,
      );
      collector.throwIfFailed();
      const compiled = collector.capture(() =>
        compileDocumentModelVersion(normalized, modules),
      );
      collector.throwIfFailed();
      if (compiled === undefined) {
        throw new TypeError("The model version could not be compiled.");
      }
      const token = {
        kind: "powerhouse.document-model-version",
        version: normalized.version as TVersion,
        documentType: normalized.id,
      } as const;
      compiledVersions.set(token, compiled);
      return token;
    },
  };
}
