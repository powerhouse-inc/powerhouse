import type {
  Action,
  Actions,
  baseActions,
  DefinitionPath,
  PHBaseState,
  PHDocument,
  Reducer,
  SchemaFirstGraphQLDocumentCompatibility,
  SignalDispatch,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import {
  type DataSnapshot,
  snapshotArray,
  snapshotDataRecord,
  snapshotRecord,
} from "./data-properties.js";
import {
  isSchemaFirstCompatibility,
  type SchemaFirstSpecificationCompatibility,
} from "./compatibility.js";
import { isTypeDescriptor } from "./descriptor-registry.js";
import {
  DefinitionDiagnosticCollector,
  type DefinitionDiagnosticCode,
} from "./diagnostics.js";
import { optionRejection } from "./field-options.js";
import {
  type CodeFirstDocumentModelModule,
  createCodeFirstRuntimeBehavior,
  materializeCodeFirstModule,
  predecessorsAndSelf,
} from "./materialize.js";
import {
  type DocumentModelActionType,
  deriveDocumentModelModuleNames,
  deriveDocumentModelNames,
  deriveOperationErrorClassName,
} from "./naming.js";
import {
  canonicalJson,
  compareCodeUnits,
  isAuthoredSchemaName,
  isNFC,
} from "./primitives.js";
import {
  compileDocumentModelVersion,
  type CompiledDocumentModelVersion,
  type DefinitionExampleDeclaration,
  type DocumentModelCompilationConfig,
  type ScopeDeclaration,
  type OperationErrorDeclaration,
  type OperationReducer,
  type RuntimeModuleDeclaration,
  type RuntimeOperationDeclaration,
} from "./structured.js";
import type {
  AnyTypeDescriptor,
  InputDescriptor,
  InputOf,
  Mutable,
  SourceOf,
  StateRootDescriptor,
} from "./types.js";

/**
 * The author interface: create a typed context, declare modules, finalize one
 * value. A module file imports the context, so the definition graph stays
 * acyclic — the context imports no module fragments.
 *
 * The returned context is opaque. It exposes neither the configuration object,
 * the Zod implementation, nor the reducer callbacks: exposing callbacks
 * repeated every field three times in emitted declarations, which is an
 * interface rule rather than an optimization.
 */

export type StateScopeDeclaration<TSchema extends StateRootDescriptor> = {
  readonly schema: TSchema;
  readonly initialValue: SourceOf<TSchema>;
  readonly examples?: readonly DefinitionExampleDeclaration[];
};

export type EmptyLocalScopeDeclaration = {
  readonly schema: null;
  readonly initialValue: Readonly<Record<string, never>>;
  readonly examples?: readonly DefinitionExampleDeclaration[];
};

export type DocumentModelConfig<
  TGlobal extends StateRootDescriptor,
  TLocal extends StateRootDescriptor | null,
  TVersion extends number,
> = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly extension: string;
  readonly version: TVersion;
  readonly author: {
    readonly name: string;
    readonly website?: string | null;
  };
  readonly changeLog?: readonly string[];
  readonly specifications: {
    readonly auxiliaryTypes?: readonly AnyTypeDescriptor[];
    readonly graphQLCompatibility?: SchemaFirstGraphQLDocumentCompatibility;
    readonly global: StateScopeDeclaration<TGlobal>;
    readonly local: TLocal extends StateRootDescriptor
      ? StateScopeDeclaration<TLocal>
      : EmptyLocalScopeDeclaration;
  };
};

type LocalStateOfDescriptor<TLocal extends StateRootDescriptor | null> =
  TLocal extends StateRootDescriptor
    ? Mutable<SourceOf<TLocal>>
    : Record<string, never>;

export type ModelState<
  TGlobal extends StateRootDescriptor,
  TLocal extends StateRootDescriptor | null,
> = PHBaseState & {
  global: Mutable<SourceOf<TGlobal>>;
  local: LocalStateOfDescriptor<TLocal>;
};

type OperationErrorClassFor<TKey extends PropertyKey> = new (
  message?: string,
) => Error & { readonly errorCode: TKey };

export type OperationErrorClasses<
  TErrors extends Readonly<Record<string, OperationErrorDeclaration>>,
> = {
  readonly [K in keyof TErrors]: OperationErrorClassFor<K>;
};

export type ModelOperationContext<
  TInput extends InputDescriptor,
  TErrors extends Readonly<Record<string, OperationErrorDeclaration>>,
> = {
  /** Only the classes this operation declares, never the module's full set. */
  readonly errors: OperationErrorClasses<TErrors>;
  readonly action: Action & { readonly input: InputOf<TInput> };
  readonly dispatch: SignalDispatch | undefined;
};

export type ModelOperationConfig<
  TState,
  TInput extends InputDescriptor,
  TErrors extends Readonly<Record<string, OperationErrorDeclaration>>,
> = {
  readonly description?: string;
  readonly input: TInput;
  readonly errors?: TErrors;
  readonly examples?: readonly DefinitionExampleDeclaration[];
  readonly template?: string | null;
  readonly reducerTemplate?: string | null;
  readonly reduce: (
    state: Mutable<TState>,
    input: Mutable<InputOf<TInput>>,
    context: ModelOperationContext<TInput, TErrors>,
  ) => void;
};

declare const operationTokenBrand: unique symbol;

export interface ModelOperationToken<
  TInput extends InputDescriptor = InputDescriptor,
  TScope extends "global" | "local" = "global" | "local",
> {
  readonly kind: "powerhouse.document-model-operation";
  readonly [operationTokenBrand]?: {
    readonly input: TInput;
    readonly scope: TScope;
  };
}

export interface ModelOperationBuilder<
  TState,
  TScope extends "global" | "local",
> {
  <
    const TInput extends InputDescriptor,
    const TErrors extends Readonly<Record<string, OperationErrorDeclaration>> =
      Record<never, never>,
  >(
    config: ModelOperationConfig<TState, TInput, TErrors>,
  ): ModelOperationToken<TInput, TScope>;
}

type InputOfOperation<T> =
  T extends ModelOperationToken<infer TInput, any> ? InputOf<TInput> : never;
type ScopeOfOperation<T> =
  T extends ModelOperationToken<any, infer TScope> ? TScope : never;

export type ActionForOperation<T, TType extends string = string> = Action & {
  readonly type: TType;
  readonly input: InputOfOperation<T>;
  readonly scope: ScopeOfOperation<T>;
};

/** An empty input keeps the generated optional creator argument. */
type CreatorParameters<T> = keyof InputOfOperation<T> extends never
  ? [input?: InputOfOperation<T>]
  : [input: InputOfOperation<T>];

export type ActionsForOperationTokens<
  TOperations extends Readonly<Record<string, ModelOperationToken>>,
> = {
  readonly [K in keyof TOperations]: (
    ...args: CreatorParameters<TOperations[K]>
  ) => ActionForOperation<TOperations[K], DocumentModelActionType<K & string>>;
};

declare const moduleTokenBrand: unique symbol;

export interface ModelModuleToken<
  TState extends PHBaseState = PHBaseState,
  TActions extends Actions = Actions,
  TKey extends string = string,
> {
  readonly kind: "powerhouse.document-model-module";
  readonly [moduleTokenBrand]?: {
    readonly state: TState;
    readonly actions: TActions;
    readonly key: TKey;
  };
}

type OverriddenActionType<TNames, TDefault extends string> = TNames extends {
  readonly actionType: infer TType extends string;
}
  ? TType
  : "actionType" extends keyof TNames
    ? string
    : TDefault;

type CompatibleActionType<
  TCompatibility,
  TPath extends string,
  TDefault extends string,
> =
  TCompatibility extends SchemaFirstSpecificationCompatibility<infer TNames>
    ? TPath extends keyof TNames
      ? OverriddenActionType<TNames[TPath], TDefault>
      :
          | TDefault
          | OverriddenActionType<TNames[Extract<keyof TNames, TPath>], never>
    : TDefault;

type ActionsOfModule<T, TCompatibility> =
  T extends ModelModuleToken<any, infer TActions, infer TKey>
    ? {
        readonly [K in keyof TActions]: (
          ...args: Parameters<TActions[K]>
        ) => Omit<ReturnType<TActions[K]>, "type"> & {
          readonly type: CompatibleActionType<
            TCompatibility,
            `operation/${TKey}/${K & string}`,
            ReturnType<TActions[K]>["type"]
          >;
        };
      }
    : never;
type UnionToIntersection<T> = (
  T extends unknown ? (value: T) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never;
type ActionsOfModules<
  TModules extends readonly ModelModuleToken[],
  TCompatibility,
  TModelActions = UnionToIntersection<
    ActionsOfModule<TModules[number], TCompatibility>
  >,
> = TModelActions & Omit<typeof baseActions, keyof TModelActions>;

declare const versionTokenBrand: unique symbol;

export interface DocumentModelVersionDefinition<
  TVersion extends number = number,
  TState extends PHBaseState = PHBaseState,
  TActions extends Actions = Actions,
> {
  readonly kind: "powerhouse.document-model-version";
  readonly version: TVersion;
  readonly documentType: string;
  readonly [versionTokenBrand]?: {
    readonly state: TState;
    readonly actions: TActions;
  };
}

export type DocumentModelVersionConfig<
  TModules extends readonly ModelModuleToken[],
  TCompatibility extends SchemaFirstSpecificationCompatibility | undefined =
    | SchemaFirstSpecificationCompatibility
    | undefined,
> = {
  readonly modules: TModules;
  /**
   * Stored IDs, stored names, and exact stored strings for a declaration that
   * has to be equivalent to an existing schema-first model. Built by
   * `schemaFirstSpecification`; the three modes stay independent.
   */
  readonly compatibility?: TCompatibility;
};

export interface DocumentModelContext<
  TGlobal extends StateRootDescriptor,
  TLocal extends StateRootDescriptor | null,
  TVersion extends number,
> {
  module<
    const TKey extends string,
    const TOperations extends Readonly<Record<string, ModelOperationToken>>,
  >(
    key: TKey,
    config: {
      readonly description?: string;
      readonly operations: (builders: {
        readonly global: ModelOperationBuilder<
          Mutable<SourceOf<TGlobal>>,
          "global"
        >;
        readonly local: ModelOperationBuilder<
          LocalStateOfDescriptor<TLocal>,
          "local"
        >;
      }) => TOperations;
    },
  ): ModelModuleToken<
    ModelState<TGlobal, TLocal>,
    ActionsForOperationTokens<TOperations>,
    TKey
  >;

  version<
    const TModules extends readonly ModelModuleToken<
      ModelState<TGlobal, TLocal>,
      Actions
    >[],
    const TCompatibility extends
      | SchemaFirstSpecificationCompatibility
      | undefined = undefined,
  >(
    config: DocumentModelVersionConfig<TModules, TCompatibility>,
  ): DocumentModelVersionDefinition<
    TVersion,
    ModelState<TGlobal, TLocal>,
    ActionsOfModules<TModules, TCompatibility>
  >;

  finalize<
    const TModules extends readonly ModelModuleToken<
      ModelState<TGlobal, TLocal>,
      Actions
    >[],
    const TCompatibility extends
      | SchemaFirstSpecificationCompatibility
      | undefined = undefined,
  >(
    config: DocumentModelVersionConfig<TModules, TCompatibility>,
  ): CodeFirstDocumentModelModule<
    ModelState<TGlobal, TLocal>,
    ActionsOfModules<TModules, TCompatibility>
  >;
}

type StateOfVersion<T> =
  T extends DocumentModelVersionDefinition<any, infer TState, any>
    ? TState
    : never;
type ActionsOfVersion<T> =
  T extends DocumentModelVersionDefinition<any, any, infer TActions>
    ? TActions
    : never;
type VersionNumberOf<T> =
  T extends DocumentModelVersionDefinition<infer TVersion, any, any>
    ? TVersion
    : never;
type ModuleOfVersion<T> = CodeFirstDocumentModelModule<
  StateOfVersion<T>,
  ActionsOfVersion<T>
>;

export type DocumentModelFamily<
  TVersions extends readonly DocumentModelVersionDefinition[] =
    readonly DocumentModelVersionDefinition[],
> = {
  readonly modules: {
    readonly [K in keyof TVersions]: ModuleOfVersion<TVersions[K]>;
  };
  readonly upgradeManifest: UpgradeManifest<readonly number[]>;
  at<const TVersion extends VersionNumberOf<TVersions[number]>>(
    version: TVersion,
  ): ModuleOfVersion<
    Extract<
      TVersions[number],
      DocumentModelVersionDefinition<TVersion, any, any>
    >
  >;
};

const operationDeclarations = new WeakMap<
  ModelOperationToken,
  Omit<RuntimeOperationDeclaration, "key">
>();
const moduleDeclarations = new WeakMap<
  ModelModuleToken,
  RuntimeModuleDeclaration
>();
const versionPlans = new WeakMap<
  DocumentModelVersionDefinition,
  CompiledDocumentModelVersion
>();
/**
 * Tokens whose declaration already produced a diagnostic. The builder still
 * returns a token so the rest of the module can be checked, and the module
 * loop stays silent about them instead of reporting a forged token.
 */
const rejectedOperations = new WeakSet<object>();

/**
 * Reads a snapshot, or records why it was rejected. The wave B rejection
 * wording is reused verbatim under a declaration code: an unsupported key
 * carries the caller's code, and every other malformation is a malformed
 * declaration member.
 */
function take<T>(
  collector: DefinitionDiagnosticCollector,
  snapshot: DataSnapshot<T>,
  unknownKeyCode: DefinitionDiagnosticCode,
  allowedKeys: readonly string[],
): T | undefined {
  if (snapshot.ok) return snapshot.value;
  const code =
    snapshot.reason === "unknown-key"
      ? unknownKeyCode
      : "PH-DM-DECLARATION-INVALID";
  const rejection = new DefinitionDiagnosticCollector();
  rejection.capture(() => optionRejection(snapshot, code, allowedKeys));
  for (const diagnostic of rejection.diagnostics) {
    collector.add({
      code,
      path: diagnostic.path,
      message: diagnostic.message,
      ...(diagnostic.expected !== undefined && {
        expected: diagnostic.expected,
      }),
      ...(diagnostic.received !== undefined && {
        received: diagnostic.received,
      }),
      repair: diagnostic.repair,
    });
  }
  return undefined;
}

function requiredString(
  collector: DefinitionDiagnosticCollector,
  value: unknown,
  path: DefinitionPath,
): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  collector.add({
    code: "PH-DM-DECLARATION-INVALID",
    path,
    message: "This declaration member must be a nonempty string.",
    expected: "a nonempty string",
    received: value === undefined ? "undefined" : typeof value,
    repair: `Give ${path.at(-1) === undefined ? "the member" : String(path.at(-1))} a nonempty string value.`,
  });
  return undefined;
}

function requiredText(
  collector: DefinitionDiagnosticCollector,
  value: unknown,
  path: DefinitionPath,
): string | undefined {
  if (typeof value === "string") return value;
  collector.add({
    code: "PH-DM-DECLARATION-INVALID",
    path,
    message: "This declaration member must be a string.",
    expected: "a string",
    received: value === undefined ? "absent" : typeof value,
    repair: `Give ${String(path.at(-1))} a string value.`,
  });
  return undefined;
}

function optionalString(
  collector: DefinitionDiagnosticCollector,
  value: unknown,
  path: DefinitionPath,
): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  collector.add({
    code: "PH-DM-DECLARATION-INVALID",
    path,
    message: "This declaration member must be a string, null, or absent.",
    expected: "a string, null, or absent",
    received: typeof value,
    repair: `Pass a string, pass null, or omit ${String(path.at(-1))}.`,
  });
  return undefined;
}

function normalizeExamples(
  collector: DefinitionDiagnosticCollector,
  value: unknown,
  path: DefinitionPath,
): readonly DefinitionExampleDeclaration[] {
  if (value === undefined) return [];
  const entries = take(
    collector,
    snapshotArray(value, path),
    "PH-DM-DECLARATION-INVALID",
    [],
  );
  if (entries === undefined) return [];
  return entries.flatMap((entry, index) => {
    const examplePath = [...path, index];
    const example = take(
      collector,
      snapshotDataRecord(entry, ["key", "value"], examplePath),
      "PH-DM-DECLARATION-INVALID",
      ["key", "value"],
    );
    if (example === undefined) return [];
    const key = requiredString(collector, example.key, [...examplePath, "key"]);
    const exampleValue = example.value;
    if (typeof exampleValue !== "string") {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [...examplePath, "value"],
        message: "An example value must be the stored JSON string.",
        expected: "string",
        received: typeof exampleValue,
        repair: 'Pass the serialized example, such as \'{"id":"item-1"}\'.',
      });
      return [];
    }
    if (key === undefined) return [];
    return [{ key, value: exampleValue }];
  });
}

function isExactEmptyObject(value: unknown): value is Record<string, never> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).length === 0
  );
}

function stateRoot(
  collector: DefinitionDiagnosticCollector,
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
  const received = isTypeDescriptor(candidate)
    ? `${candidate.kind} ${JSON.stringify(candidate.name)}`
    : candidate === null
      ? "null"
      : candidate === undefined
        ? "absent"
        : typeof candidate;
  collector.add({
    code: "PH-DM-STATE-ROOT-INVALID",
    path,
    message: `A state root must be a ph.object named ${expectedName}.`,
    expected: `ph.object(${JSON.stringify(expectedName)}, { fields: { ... } })`,
    received,
    repair: `Declare this scope as ph.object(${JSON.stringify(expectedName)}, { fields: { ... } }); the root name is derived from the model name.`,
  });
  return undefined;
}

function normalizeScope(
  collector: DefinitionDiagnosticCollector,
  value: unknown,
  scope: "global" | "local",
  expectedName: string,
  path: DefinitionPath,
): ScopeDeclaration | undefined {
  const declaration = take(
    collector,
    snapshotRecord(value, ["schema", "initialValue", "examples"], path),
    "PH-DM-DECLARATION-INVALID",
    ["schema", "initialValue", "examples"],
  );
  if (declaration === undefined) return undefined;
  const examples = normalizeExamples(collector, declaration.examples, [
    ...path,
    "examples",
  ]);
  // Only local.schema may be null, and only with an exact empty plain JSON
  // object initial value. `{}` in TypeScript also admits nonempty objects and
  // nonnullish primitives, so the runtime check is the narrow one.
  if (scope === "local" && declaration.schema === null) {
    if (!isExactEmptyObject(declaration.initialValue)) {
      collector.add({
        code: "PH-DM-INITIAL-VALUE-INVALID",
        path: [...path, "initialValue"],
        message:
          "An empty local scope requires an exact empty plain JSON object as its initial value.",
        expected: "{}",
        received:
          declaration.initialValue === null
            ? "null"
            : Array.isArray(declaration.initialValue)
              ? "array"
              : typeof declaration.initialValue === "object"
                ? "a nonempty object or a custom prototype"
                : typeof declaration.initialValue,
        repair: "Use local: { schema: null, initialValue: {} }.",
      });
      return undefined;
    }
    return { root: null, initialValue: {}, examples };
  }
  const root = stateRoot(collector, declaration.schema, expectedName, [
    ...path,
    "schema",
  ]);
  if (root === undefined) return undefined;
  // The value is materialized during compilation, after the descriptor
  // traversal has reported any broken reference at its authored coordinate.
  return { root, initialValue: declaration.initialValue, examples };
}

const CONFIG_KEYS = [
  "id",
  "name",
  "description",
  "extension",
  "version",
  "author",
  "changeLog",
  "specifications",
] as const;

const SPECIFICATION_KEYS = [
  "auxiliaryTypes",
  "graphQLCompatibility",
  "global",
  "local",
] as const;

function rejectAuthorization(
  collector: DefinitionDiagnosticCollector,
  container: unknown,
  path: DefinitionPath,
): void {
  if (
    container === null ||
    typeof container !== "object" ||
    !Object.hasOwn(container, "auth")
  ) {
    return;
  }
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
}

function normalizeSpecifications(
  collector: DefinitionDiagnosticCollector,
  value: unknown,
  names: { readonly global: string; readonly local: string },
): DocumentModelCompilationConfig["specifications"] | undefined {
  const path: DefinitionPath = ["specifications"];
  rejectAuthorization(collector, value, path);
  if (value !== null && typeof value === "object") {
    // `specifications` is the scope map plus two reserved members. Any other
    // key is an authored platform or custom scope, which V1 does not admit.
    for (const key of Object.keys(value)) {
      if (key === "auth") continue;
      if ((SPECIFICATION_KEYS as readonly string[]).includes(key)) continue;
      collector.add({
        code: "PH-DM-SCOPE-UNSUPPORTED",
        path: [...path, key],
        message: `Scope ${JSON.stringify(key)} cannot be declared; DocumentSpecification.state describes global and local only.`,
        expected: "global or local",
        received: key,
        repair:
          "Remove the scope. auth, document, and header stay platform concerns, and runtime action scopes keep their current handling.",
      });
    }
  }
  const specifications = take(
    collector,
    snapshotRecord(value, [...SPECIFICATION_KEYS], path),
    "PH-DM-SCOPE-UNSUPPORTED",
    [...SPECIFICATION_KEYS],
  );
  if (specifications === undefined) return undefined;

  const auxiliary =
    specifications.auxiliaryTypes === undefined
      ? []
      : (take(
          collector,
          snapshotArray(specifications.auxiliaryTypes, [
            ...path,
            "auxiliaryTypes",
          ]),
          "PH-DM-DECLARATION-INVALID",
          [],
        ) ?? []);
  const auxiliaryTypes = auxiliary.flatMap((candidate, index) => {
    if (isTypeDescriptor(candidate)) return [candidate];
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "auxiliaryTypes", index],
      message:
        "An auxiliary type must be a named type created by a ph builder.",
      expected: "a named type descriptor",
      received: candidate === null ? "null" : typeof candidate,
      repair:
        "List descriptors returned by ph.enum, ph.object, ph.input, ph.interface, or ph.union.",
    });
    return [];
  });

  const global = normalizeScope(
    collector,
    specifications.global,
    "global",
    names.global,
    [...path, "global"],
  );
  const local = normalizeScope(
    collector,
    specifications.local,
    "local",
    names.local,
    [...path, "local"],
  );
  if (global === undefined || global.root === null || local === undefined) {
    return undefined;
  }
  return {
    auxiliaryTypes,
    graphQLCompatibility:
      (specifications.graphQLCompatibility as
        | SchemaFirstGraphQLDocumentCompatibility
        | undefined) ?? null,
    global: { ...global, root: global.root },
    local,
  };
}

function normalizeConfig(
  collector: DefinitionDiagnosticCollector,
  input: unknown,
  contextId: symbol,
): DocumentModelCompilationConfig | undefined {
  rejectAuthorization(collector, input, []);
  const config = take(
    collector,
    snapshotRecord(input, [...CONFIG_KEYS], []),
    "PH-DM-DECLARATION-INVALID",
    [...CONFIG_KEYS],
  );
  if (config === undefined) return undefined;

  const id = requiredString(collector, config.id, ["id"]);
  const name = requiredString(collector, config.name, ["name"]);
  const description = requiredText(collector, config.description, [
    "description",
  ]);
  const extension = requiredString(collector, config.extension, ["extension"]);
  const version = config.version;
  if (
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version <= 0
  ) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["version"],
      message: "A code-first model version must be a positive safe integer.",
      expected: "a positive safe integer",
      received: typeof version === "number" ? String(version) : typeof version,
      repair: "Use version: 1, or the next integer for a later version.",
    });
  }
  const author = take(
    collector,
    snapshotRecord(config.author, ["name", "website"], ["author"]),
    "PH-DM-DECLARATION-INVALID",
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
      : (take(
          collector,
          snapshotArray(config.changeLog, ["changeLog"]),
          "PH-DM-DECLARATION-INVALID",
          [],
        ) ?? []);
  const changeLog = changeLogEntries.flatMap((entry, index) => {
    const line = requiredString(collector, entry, ["changeLog", index]);
    return line === undefined ? [] : [line];
  });

  if (id === undefined || name === undefined) return undefined;
  const names = deriveDocumentModelNames({ id, name });
  const specifications = normalizeSpecifications(
    collector,
    config.specifications,
    {
      global: names.globalStateRootName,
      local: names.localStateRootName,
    },
  );
  if (
    specifications === undefined ||
    description === undefined ||
    extension === undefined ||
    authorName === undefined ||
    website === undefined ||
    typeof version !== "number"
  ) {
    return undefined;
  }
  return {
    contextId,
    id,
    name,
    description,
    extension,
    version,
    author: { name: authorName, website },
    changeLog,
    compatibility: null,
    names,
    specifications,
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
] as const;

const ERROR_KEYS = ["code", "name", "description", "template"] as const;

function normalizeErrors(
  collector: DefinitionDiagnosticCollector,
  value: unknown,
  path: DefinitionPath,
): Readonly<Record<string, OperationErrorDeclaration>> {
  if (value === undefined) return {};
  const keys =
    value !== null && typeof value === "object"
      ? Reflect.ownKeys(value).filter(
          (key): key is string => typeof key === "string",
        )
      : [];
  const errors = take(
    collector,
    snapshotRecord(value, keys, path),
    "PH-DM-DECLARATION-INVALID",
    keys,
  );
  if (errors === undefined) return {};
  const normalized: Record<string, OperationErrorDeclaration> = {};
  for (const [key, declaration] of Object.entries(errors)) {
    const errorPath = [...path, key];
    if (!isNFC(key) || key.length === 0) {
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
      // The key is the runtime class name, the `errorCode`, and the default
      // message, and a failed operation persists that message. The generator
      // derives the same three from `pascalCase(name)`, so an equivalent
      // schema-first model persists a different string unless the key is
      // already in that form.
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
      snapshotDataRecord(declaration, [...ERROR_KEYS], errorPath),
      "PH-DM-DECLARATION-INVALID",
      [...ERROR_KEYS],
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
      if (text === undefined) {
        valid = false;
        continue;
      }
      // An authored empty string is preserved; null and absent fall back at
      // materialization time.
      entry[member] = metadata[member] === null ? null : text;
    }
    if (valid) normalized[key] = entry as OperationErrorDeclaration;
  }
  return normalized;
}

function operationBuilder<TState, TScope extends "global" | "local">(
  collector: DefinitionDiagnosticCollector,
  scope: TScope,
): ModelOperationBuilder<TState, TScope> {
  return ((input: unknown) => {
    const token: ModelOperationToken = {
      kind: "powerhouse.document-model-operation",
    };
    const path: DefinitionPath = ["operations"];
    const config = take(
      collector,
      snapshotRecord(input, [...OPERATION_KEYS], path),
      "PH-DM-DECLARATION-INVALID",
      [...OPERATION_KEYS],
    );
    if (config === undefined) {
      rejectedOperations.add(token);
      return token;
    }
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
            : typeof descriptor,
        repair:
          "Declare input: ph.input({ fields: { ... } }); an operation with no fields uses ph.input({ fields: {} }).",
      });
      rejectedOperations.add(token);
      return token;
    }
    if (typeof config.reduce !== "function") {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [...path, "reduce"],
        message: "An operation must declare one reducer.",
        expected: "reduce(state, input, ctx)",
        received: config.reduce === undefined ? "absent" : typeof config.reduce,
        repair: "Add reduce(state, input, ctx) to the operation declaration.",
      });
      rejectedOperations.add(token);
      return token;
    }
    const description = optionalString(collector, config.description, [
      ...path,
      "description",
    ]);
    const template = optionalString(collector, config.template, [
      ...path,
      "template",
    ]);
    const reducerTemplate = optionalString(collector, config.reducerTemplate, [
      ...path,
      "reducerTemplate",
    ]);
    operationDeclarations.set(token, {
      scope,
      input: descriptor as InputDescriptor,
      description: description ?? null,
      errors: normalizeErrors(collector, config.errors, [...path, "errors"]),
      examples: normalizeExamples(collector, config.examples, [
        ...path,
        "examples",
      ]),
      template: template ?? null,
      reducerTemplate: reducerTemplate ?? null,
      reduce: config.reduce as OperationReducer,
    });
    return token;
  }) as ModelOperationBuilder<TState, TScope>;
}

function normalizeModule(
  collector: DefinitionDiagnosticCollector,
  contextId: symbol,
  key: unknown,
  config: unknown,
): RuntimeModuleDeclaration | undefined {
  const moduleKey = requiredString(collector, key, ["modules", "key"]);
  if (moduleKey !== undefined && !isNFC(moduleKey)) {
    collector.add({
      code: "PH-DM-IDENTITY-INVALID",
      path: ["modules", "key"],
      message:
        "A module key is an identity segment, so it must already be in Unicode NFC.",
      expected: "a module key in Unicode NFC",
      received: moduleKey,
      repair: "Rewrite the module key in Unicode NFC.",
    });
    return undefined;
  }
  const storedName =
    moduleKey === undefined
      ? undefined
      : deriveDocumentModelModuleNames("", moduleKey).storedName;
  if (storedName !== undefined && !isAuthoredSchemaName(storedName)) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["modules", "key"],
      message: `Module key ${JSON.stringify(moduleKey)} derives the invalid stored name ${JSON.stringify(storedName)}.`,
      expected: "a key whose derived stored name is a GraphQL name",
      received: String(moduleKey),
      repair: "Use a module key such as lineItems or line-items.",
    });
    return undefined;
  }
  const declaration = take(
    collector,
    snapshotRecord(config, ["description", "operations"], ["module"]),
    "PH-DM-DECLARATION-INVALID",
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
          : typeof declaration.operations,
      repair: "Use operations: ({ global, local }) => ({ ... }).",
    });
    return undefined;
  }
  const declare = declaration.operations as (builders: {
    readonly global: unknown;
    readonly local: unknown;
  }) => unknown;
  // The scope builders exist only inside context.module: calling one selects
  // the stored scope and narrows `state` before the reducer is authored.
  const declared = declare({
    global: operationBuilder(collector, "global"),
    local: operationBuilder(collector, "local"),
  });
  const keys =
    declared !== null && typeof declared === "object"
      ? Reflect.ownKeys(declared).filter(
          (name): name is string => typeof name === "string",
        )
      : [];
  const operationMap = take(
    collector,
    snapshotRecord(declared, keys, ["module", "operations"]),
    "PH-DM-DECLARATION-INVALID",
    keys,
  );
  if (operationMap === undefined) return undefined;
  const operations: RuntimeOperationDeclaration[] = [];
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
    const declarationForKey =
      candidate !== null && typeof candidate === "object"
        ? operationDeclarations.get(candidate as ModelOperationToken)
        : undefined;
    if (declarationForKey === undefined) {
      if (
        candidate !== null &&
        typeof candidate === "object" &&
        rejectedOperations.has(candidate)
      ) {
        continue;
      }
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path,
        message:
          "An operation entry must be the value returned by the global(...) or local(...) builder.",
        expected: "an operation token",
        received: candidate === null ? "null" : typeof candidate,
        repair:
          "Wrap the operation declaration with the scope builder the operations callback receives.",
      });
      continue;
    }
    const firstKey = seen.get(candidate as object);
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
    seen.set(candidate as object, operationKey);
    operations.push({ ...declarationForKey, key: operationKey });
  }
  return {
    contextId,
    key: moduleKey,
    description: description ?? null,
    operations,
  };
}

export function defineDocumentModel<
  const TGlobal extends StateRootDescriptor,
  const TLocal extends StateRootDescriptor | null,
  const TVersion extends number,
>(
  config: DocumentModelConfig<TGlobal, TLocal, TVersion>,
): DocumentModelContext<TGlobal, TLocal, TVersion> {
  const contextId = Symbol("powerhouse.document-model-context");
  const configCollector = new DefinitionDiagnosticCollector();
  const normalized = normalizeConfig(configCollector, config, contextId);
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

  const compile = (
    modules: readonly unknown[],
    collector: DefinitionDiagnosticCollector,
    compatibility?: SchemaFirstSpecificationCompatibility,
  ): CompiledDocumentModelVersion | undefined => {
    const declarations = modules.flatMap((module, index) => {
      const declaration =
        module !== null && typeof module === "object"
          ? moduleDeclarations.get(module as ModelModuleToken)
          : undefined;
      if (declaration === undefined) {
        collector.add({
          code: "PH-DM-DECLARATION-INVALID",
          path: ["modules", index],
          message: "A finalized value is not a document-model module token.",
          expected: "a module token returned by context.module",
          received: module === null ? "null" : typeof module,
          repair: "Pass only the values returned by this context's module().",
        });
        return [];
      }
      return [declaration];
    });
    collector.throwIfFailed();
    return collector.capture(() =>
      compileDocumentModelVersion(
        compatibility === undefined
          ? normalized
          : { ...normalized, compatibility },
        declarations,
      ),
    );
  };

  const context: DocumentModelContext<TGlobal, TLocal, TVersion> = {
    module(key, moduleConfig) {
      const collector = new DefinitionDiagnosticCollector(definitionRef);
      const declaration = normalizeModule(
        collector,
        contextId,
        key,
        moduleConfig,
      );
      collector.throwIfFailed();
      if (declaration === undefined) {
        throw new TypeError("The module declaration could not be normalized.");
      }
      const token: ModelModuleToken = {
        kind: "powerhouse.document-model-module",
      };
      moduleDeclarations.set(token, declaration);
      return token as never;
    },
    version(versionConfig) {
      const collector = new DefinitionDiagnosticCollector(definitionRef);
      const declaration = take(
        collector,
        snapshotRecord(
          versionConfig,
          ["modules", "compatibility"],
          ["version"],
        ),
        "PH-DM-DECLARATION-INVALID",
        ["modules", "compatibility"],
      );
      const compatibility = declaration?.compatibility;
      if (
        compatibility !== undefined &&
        !isSchemaFirstCompatibility(compatibility)
      ) {
        collector.add({
          code: "PH-DM-COMPATIBILITY-INVALID",
          path: ["compatibility"],
          message:
            "Compatibility data must come from the schemaFirstSpecification helper.",
          expected: "schemaFirstSpecification({ ids, names, serialization })",
          received: compatibility === null ? "null" : typeof compatibility,
          repair:
            "Build the compatibility declaration with schemaFirstSpecification so its maps are checked before compilation.",
        });
        collector.throwIfFailed();
      }
      const modules =
        declaration === undefined
          ? undefined
          : take(
              collector,
              snapshotArray(declaration.modules, ["modules"]),
              "PH-DM-DECLARATION-INVALID",
              [],
            );
      if (modules === undefined) {
        collector.add({
          code: "PH-DM-DECLARATION-INVALID",
          path: ["modules"],
          message: "A model version requires an array of module tokens.",
          expected: "modules: [oneModule, anotherModule]",
          received: "absent",
          repair: "Pass every module token of this version in one array.",
        });
        collector.throwIfFailed();
        throw new TypeError("A model version requires module tokens.");
      }
      const plan = compile(
        modules,
        collector,
        compatibility as SchemaFirstSpecificationCompatibility | undefined,
      );
      collector.throwIfFailed();
      if (plan === undefined) {
        throw new TypeError("The model version could not be compiled.");
      }
      const token: DocumentModelVersionDefinition = {
        kind: "powerhouse.document-model-version",
        version: normalized.version,
        documentType: normalized.id,
      };
      versionPlans.set(token, plan);
      return token as never;
    },
    finalize(finalizeConfig) {
      // One version is a one-version family, so single-version finalization
      // and family composition share the compilation and materialization path.
      const version = context.version(finalizeConfig);
      return defineDocumentModelFamily({
        versions: [version],
        upgradeManifest: {
          documentType: normalized.id,
          latestVersion: normalized.version,
          supportedVersions: [normalized.version],
          upgrades: {},
        },
      }).at(normalized.version as never) as never;
    },
  };
  return context;
}

function familyPlans(
  collector: DefinitionDiagnosticCollector,
  config: unknown,
): readonly CompiledDocumentModelVersion[] {
  const declaration = take(
    collector,
    snapshotRecord(config, ["versions", "upgradeManifest"], []),
    "PH-DM-DECLARATION-INVALID",
    ["versions", "upgradeManifest"],
  );
  if (declaration === undefined) {
    collector.throwIfFailed();
    return [];
  }
  const versions =
    take(
      collector,
      snapshotArray(declaration.versions, ["versions"]),
      "PH-DM-DECLARATION-INVALID",
      [],
    ) ?? [];
  if (versions.length === 0) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["versions"],
      message: "A document-model family requires at least one version.",
      expected: "a nonempty version tuple",
      received: String(versions.length),
      repair: "List every version returned by context.version({ modules }).",
    });
  }
  const plans = versions.flatMap((version, index) => {
    const plan =
      version !== null && typeof version === "object"
        ? versionPlans.get(version as DocumentModelVersionDefinition)
        : undefined;
    if (plan === undefined) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: ["versions", index],
        message:
          "A family version must be a token returned by context.version.",
        expected: "an opaque version token",
        received: version === null ? "null" : typeof version,
        repair:
          "Pass context.version({ modules }) results; a version token is not registrable on its own.",
      });
      return [];
    }
    return [plan];
  });
  collector.throwIfFailed();
  return plans;
}

const MANIFEST_KEYS = [
  "documentType",
  "latestVersion",
  "supportedVersions",
  "upgrades",
] as const;
const TRANSITION_KEYS = ["toVersion", "upgradeReducer", "description"] as const;

/**
 * Holds the authored upgrade manifest to the versions it sits beside.
 *
 * A code-first model writes its manifest by hand in
 * `upgrades/upgrade-manifest.ts`, where a schema-first model's is generated,
 * so the version set is declared twice: once by the versions the family
 * composes, once by the manifest. This is where the two are made to agree.
 * The family then publishes the authored object itself, so the value a host
 * registers is the one the author wrote.
 */
function checkUpgradeManifest(
  collector: DefinitionDiagnosticCollector,
  value: unknown,
  plans: readonly CompiledDocumentModelVersion[],
): void {
  const path: DefinitionPath = ["upgradeManifest"];
  if (value === undefined) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path,
      message: "A document-model family requires its upgrade manifest.",
      expected: "the manifest exported by upgrades/upgrade-manifest.ts",
      received: "absent",
      repair:
        "Pass the manifest that lists every version and the upgrade into each one after the first.",
    });
    return;
  }
  const manifest = take(
    collector,
    snapshotRecord(value, MANIFEST_KEYS, path),
    "PH-DM-DECLARATION-INVALID",
    MANIFEST_KEYS,
  );
  const first = plans.at(0);
  if (manifest === undefined || first === undefined) return;
  const versions = plans.map((plan) => plan.config.version);

  if (manifest.documentType !== first.config.id) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "documentType"],
      message: "The upgrade manifest names a different document type.",
      expected: first.config.id,
      received: String(manifest.documentType),
      repair: "Use the id every version of the family declares.",
    });
  }

  const supported = snapshotArray(manifest.supportedVersions, [
    ...path,
    "supportedVersions",
  ]);
  const sameVersions =
    supported.ok &&
    supported.value.length === versions.length &&
    supported.value.every((version, index) => version === versions[index]);
  if (!sameVersions) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "supportedVersions"],
      message: "The upgrade manifest and the family list different versions.",
      expected: JSON.stringify(versions),
      received: supported.ok
        ? JSON.stringify(supported.value)
        : typeof manifest.supportedVersions,
      repair:
        "List every version the family composes in upgrades/versions.ts, in ascending order.",
    });
  }
  if (manifest.latestVersion !== versions.at(-1)) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "latestVersion"],
      message:
        "The upgrade manifest's latest version is not the family's last.",
      expected: String(versions.at(-1)),
      received: String(manifest.latestVersion),
      repair: "Set latestVersion to the last entry of supportedVersions.",
    });
  }

  const upgradesPath: DefinitionPath = [...path, "upgrades"];
  const upgrades = take(
    collector,
    snapshotRecord(manifest.upgrades, undefined, upgradesPath),
    "PH-DM-DECLARATION-INVALID",
    [],
  );
  if (upgrades === undefined) return;
  const expected = versions.slice(1).map((version) => `v${version}`);
  const actual = Object.keys(upgrades).sort(compareCodeUnits);
  const missing = expected.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !expected.includes(key));
  if (missing.length > 0 || extra.length > 0) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: upgradesPath,
      message:
        "A family needs exactly one upgrade transition for every version after the first.",
      expected: expected.join(", ") || "no transitions",
      received: actual.join(", ") || "no transitions",
      repair:
        "Key each transition by the version it upgrades to, as upgrades: { v2 } in upgrades/upgrade-manifest.ts.",
    });
  }

  for (const version of versions.slice(1)) {
    const key = `v${version}`;
    if (!Object.hasOwn(upgrades, key)) continue;
    const transitionPath: DefinitionPath = [...upgradesPath, key];
    const transition = take(
      collector,
      snapshotRecord(upgrades[key], TRANSITION_KEYS, transitionPath),
      "PH-DM-DECLARATION-INVALID",
      TRANSITION_KEYS,
    );
    if (transition === undefined) continue;
    if (transition.toVersion !== version) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [...transitionPath, "toVersion"],
        message: `The transition under ${key} must target version ${version}.`,
        expected: String(version),
        received: String(transition.toVersion),
        repair: "Set toVersion to the version the transition is keyed by.",
      });
    }
    if (typeof transition.upgradeReducer !== "function") {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [...transitionPath, "upgradeReducer"],
        message: "An upgrade transition must carry a callable upgradeReducer.",
        expected: "a function",
        received:
          transition.upgradeReducer === undefined
            ? "absent"
            : typeof transition.upgradeReducer,
        repair:
          "Write the upgrade by hand: it rewrites both state and initialState.",
      });
    }
    optionalString(collector, transition.description, [
      ...transitionPath,
      "description",
    ]);
  }
}

function checkFamilyVersions(
  collector: DefinitionDiagnosticCollector,
  plans: readonly CompiledDocumentModelVersion[],
): void {
  const first = plans.at(0);
  if (first === undefined) return;
  const firstModel = canonicalJson(first.definition.model);
  plans.forEach((plan, index) => {
    const path: DefinitionPath = ["versions", index];
    if (plan.config.id !== first.config.id) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [...path, "documentType"],
        message: "Every version of a family must use one document type.",
        expected: first.config.id,
        received: plan.config.id,
        repair: "Compose only the versions declared with the same model id.",
      });
      return;
    }
    if (canonicalJson(plan.definition.model) !== firstModel) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [...path, "model"],
        message:
          "Family model metadata must be identical across versions, because the stored document model carries one copy of it.",
        expected: firstModel,
        received: canonicalJson(plan.definition.model),
        repair:
          "Use the same name, description, extension, and author in every version of the family.",
      });
    }
    const previous = plans.at(index - 1);
    if (previous === undefined || index === 0) return;
    if (plan.config.version !== previous.config.version + 1) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [...path, "version"],
        message:
          "Family versions must be unique, contiguous, and authored in ascending order, so the last entry stays the latest.",
        expected: String(previous.config.version + 1),
        received: String(plan.config.version),
        repair: "List every consecutive version once, in ascending order.",
      });
    }
  });
}

export function defineDocumentModelFamily<
  const TVersions extends readonly DocumentModelVersionDefinition[],
>(config: {
  readonly versions: TVersions;
  readonly upgradeManifest: UpgradeManifest<readonly number[]>;
}): DocumentModelFamily<TVersions> {
  const collector = new DefinitionDiagnosticCollector();
  const plans = familyPlans(collector, config);
  checkFamilyVersions(collector, plans);
  checkUpgradeManifest(
    collector,
    (config as { readonly upgradeManifest?: unknown }).upgradeManifest,
    plans,
  );
  collector.throwIfFailed();
  const first = plans.at(0);
  if (first === undefined) {
    throw new TypeError(
      "A document-model family requires at least one version.",
    );
  }
  const documentType = first.config.id;
  const { upgradeManifest } = config;
  const supportedVersions = plans.map((plan) => plan.config.version);

  const behaviors = plans.map((plan) => createCodeFirstRuntimeBehavior(plan));
  const modules = plans.map((plan, index) =>
    materializeCodeFirstModule({
      plan,
      plans,
      behavior: behaviors[index] as (typeof behaviors)[number],
      // Version-aware loading closes over this version and its predecessors,
      // as the generated `utils.ts` of each version does.
      reducers: Object.fromEntries(
        predecessorsAndSelf(plan, plans).map((candidate) => [
          candidate.config.version,
          behaviors[plans.indexOf(candidate)]
            ?.reducer as unknown as Reducer<PHBaseState>,
        ]),
      ),
      upgradeManifest,
    }),
  );

  return {
    modules: modules as never,
    upgradeManifest,
    at(version) {
      const module = modules.find((candidate) => candidate.version === version);
      if (module === undefined) {
        throw new RangeError(
          `Document model ${documentType} has no version ${String(version)}; it publishes ${supportedVersions.join(", ")}.`,
        );
      }
      return module as never;
    },
  };
}

export type GlobalStateOf<T> =
  T extends CodeFirstDocumentModelModule<infer TState, any>
    ? TState extends { global: infer TGlobal }
      ? TGlobal
      : never
    : never;

export type LocalStateOf<T> =
  T extends CodeFirstDocumentModelModule<infer TState, any>
    ? TState extends { local: infer TLocal }
      ? TLocal
      : never
    : never;

export type DocumentOf<T> =
  T extends CodeFirstDocumentModelModule<infer TState, any>
    ? PHDocument<TState>
    : never;

export type ActionOf<T> =
  T extends CodeFirstDocumentModelModule<any, infer TActions>
    ? ReturnType<TActions[keyof TActions]>
    : never;
