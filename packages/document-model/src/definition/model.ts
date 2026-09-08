import type {
  Action,
  Actions,
  DefinitionDiagnosticV1,
  LegacyGraphQLDocumentCompatibilityV1,
  DocumentModelSpecificationDefinitionV1,
  DocumentSpecification,
  PHBaseState,
  PHDocument,
  SignalDispatch,
  UpgradeManifest,
  UpgradeTransition,
  baseActions,
} from "@powerhousedao/shared/document-model";
import type {
  AnyTypeDescriptor,
  InputDescriptor,
  InputOf,
  Mutable,
  SourceOf,
  StateRootDescriptor,
} from "./types.js";
import {
  asBaseReducer,
  createCodeFirstRuntimeBehavior,
  materializeCodeFirstModule,
  type MaterializedCodeFirstModule,
} from "./materialize.js";
import {
  compileDocumentModelVersion,
  type CompiledDocumentModelVersion,
  type DefinitionExampleDeclaration,
  type DocumentModelCompilationConfig,
  type OperationErrorDeclaration,
  type RuntimeModuleDeclaration,
  type RuntimeOperationDeclaration,
} from "./structured.js";
import { snapshotDataArray, snapshotDataRecord } from "./data-properties.js";
import {
  DefinitionDiagnosticError,
  sortDefinitionDiagnostics,
} from "./diagnostics.js";
import { canonicalJson } from "./primitives.js";
import { isTypeDescriptor } from "./descriptor-registry.js";
import type { JsonValue } from "@powerhousedao/shared/document-model";

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
    readonly graphQLCompatibility?: LegacyGraphQLDocumentCompatibilityV1;
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

type RuntimeErrorClass<TKey extends PropertyKey> = new (
  message?: string,
) => Error & { readonly errorCode: TKey };

export type OperationErrorClasses<
  TErrors extends Readonly<Record<string, OperationErrorDeclaration>>,
> = {
  readonly [K in keyof TErrors]: RuntimeErrorClass<K>;
};

export type ModelOperationContext<
  TInput extends InputDescriptor,
  TErrors extends Readonly<Record<string, OperationErrorDeclaration>>,
> = {
  readonly errors: OperationErrorClasses<TErrors>;
  readonly action: Action & { readonly input: InputOf<TInput> };
  readonly dispatch: SignalDispatch | undefined;
};

type LegacyOperationReducer<TState, TInput extends InputDescriptor> = (
  state: Mutable<TState>,
  action: Action & { readonly input: Mutable<InputOf<TInput>> },
  dispatch?: SignalDispatch,
) => void;

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
} & (
  | {
      readonly reduce: (
        state: Mutable<TState>,
        input: Mutable<InputOf<TInput>>,
        context: ModelOperationContext<TInput, TErrors>,
      ) => void;
      readonly reduceLegacy?: never;
    }
  | {
      readonly reduce?: never;
      readonly reduceLegacy: LegacyOperationReducer<TState, TInput>;
    }
);

export type LegacySpecificationCompatibility = {
  readonly kind: "explicit-legacy";
  /** The normalized V1 projection produced by the legacy module Adapter. */
  readonly definition: DocumentModelSpecificationDefinitionV1;
  /** Exact stored bytes and metadata retained by DocumentModelPHState. */
  readonly materialized: DocumentSpecification;
};

export type DocumentModelVersionConfig<
  TModules extends readonly ModelModuleToken[],
> = {
  readonly modules: TModules;
  readonly compatibility?: LegacySpecificationCompatibility;
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

export type ActionForOperation<T> = Action & {
  readonly input: InputOfOperation<T>;
  readonly scope: ScopeOfOperation<T>;
};

export type ActionsForOperationTokens<
  TOperations extends Readonly<Record<string, ModelOperationToken>>,
> = {
  readonly [K in keyof TOperations]: (
    input: InputOfOperation<TOperations[K]>,
  ) => ActionForOperation<TOperations[K]>;
};

declare const moduleTokenBrand: unique symbol;
export interface ModelModuleToken<
  TState extends PHBaseState = PHBaseState,
  TActions extends Actions = Actions,
> {
  readonly kind: "powerhouse.document-model-module";
  readonly [moduleTokenBrand]?: {
    readonly state: TState;
    readonly actions: TActions;
  };
}

type ActionsOfModule<T> =
  T extends ModelModuleToken<any, infer TActions> ? TActions : never;
type UnionToIntersection<T> = (
  T extends unknown ? (value: T) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never;
type ActionsOfModules<TModules extends readonly ModelModuleToken[]> =
  UnionToIntersection<ActionsOfModule<TModules[number]>> & typeof baseActions;

export type CodeFirstDocumentModelModule<
  TState extends PHBaseState,
  TActions extends Actions,
> = MaterializedCodeFirstModule<TState, TActions>;

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

export interface DocumentModelContext<
  TGlobal extends StateRootDescriptor,
  TLocal extends StateRootDescriptor | null,
  TVersion extends number,
> {
  module<
    const TOperations extends Readonly<Record<string, ModelOperationToken>>,
  >(
    key: string,
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
    ActionsForOperationTokens<TOperations>
  >;

  finalize<
    const TModules extends readonly ModelModuleToken<
      ModelState<TGlobal, TLocal>,
      Actions
    >[],
  >(
    config: DocumentModelVersionConfig<TModules>,
  ): CodeFirstDocumentModelModule<
    ModelState<TGlobal, TLocal>,
    ActionsOfModules<TModules>
  >;

  version<
    const TModules extends readonly ModelModuleToken<
      ModelState<TGlobal, TLocal>,
      Actions
    >[],
  >(
    config: DocumentModelVersionConfig<TModules>,
  ): DocumentModelVersionDefinition<
    TVersion,
    ModelState<TGlobal, TLocal>,
    ActionsOfModules<TModules>
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
type VersionOf<T> =
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
  at<const TVersion extends VersionOf<TVersions[number]>>(
    version: TVersion,
  ): ModuleOfVersion<
    Extract<
      TVersions[number],
      DocumentModelVersionDefinition<TVersion, any, any>
    >
  >;
};

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
const documentModelFamilyModules = new WeakMap<
  object,
  readonly CodeFirstDocumentModelModule<PHBaseState, Actions>[]
>();

export function getDocumentModelFamilyModules(
  value: unknown,
): readonly CodeFirstDocumentModelModule<PHBaseState, Actions>[] | undefined {
  return value !== null && typeof value === "object"
    ? documentModelFamilyModules.get(value)
    : undefined;
}

function diagnosticFromError(
  error: DefinitionDiagnosticError,
  definition?: { readonly key: string; readonly version?: number },
): DefinitionDiagnosticV1 {
  return {
    code: error.code,
    severity: "error",
    phase: "definition",
    source: { specifier: "document-model#inline-definition" },
    ...(definition
      ? {
          definition: {
            kind: "document-model" as const,
            key: definition.key,
            ...(definition.version === undefined
              ? {}
              : { version: definition.version }),
          },
        }
      : {}),
    path: error.path,
    message: error.message,
    ...(error.expected ? { expected: error.expected } : {}),
    ...(error.received ? { received: error.received } : {}),
    repair: error.repair,
  };
}

export class DocumentModelDefinitionError extends Error {
  readonly diagnostics: readonly DefinitionDiagnosticV1[];

  constructor(diagnostics: readonly DefinitionDiagnosticV1[]) {
    super(
      diagnostics.length === 1
        ? diagnostics[0]?.message
        : `${diagnostics.length} document-model definition errors`,
    );
    this.name = "DocumentModelDefinitionError";
    this.diagnostics = sortDefinitionDiagnostics(diagnostics);
  }
}

function rethrowDefinitionError(
  error: unknown,
  definition?: { readonly key: string; readonly version?: number },
): never {
  if (error instanceof DocumentModelDefinitionError) throw error;
  if (error instanceof DefinitionDiagnosticError) {
    throw new DocumentModelDefinitionError([
      diagnosticFromError(error, definition),
    ]);
  }
  throw error;
}

function stableRecord(
  value: unknown,
  path: readonly (string | number)[],
): Readonly<Record<string, unknown>> {
  const inspected = snapshotDataRecord(value);
  if (inspected.ok) return inspected.value;
  throw new DefinitionDiagnosticError({
    code: "PH-DM-CONFIG-INVALID",
    path:
      inspected.key === undefined
        ? path
        : [
            ...path,
            typeof inspected.key === "number"
              ? inspected.key
              : String(inspected.key),
          ],
    message:
      "A document-model declaration must contain stable enumerable data properties.",
    repair:
      "Use a plain object without accessors, proxies, or custom prototypes.",
  });
}

function stableArray(
  value: unknown,
  path: readonly (string | number)[],
  message: string,
): readonly unknown[] {
  const inspected = snapshotDataArray(value);
  if (inspected.ok) return inspected.value;
  throw new DefinitionDiagnosticError({
    code: "PH-DM-CONFIG-INVALID",
    path:
      inspected.key === undefined
        ? path
        : [
            ...path,
            typeof inspected.key === "number"
              ? inspected.key
              : String(inspected.key),
          ],
    message,
    repair: "Use a plain, dense array without accessors or custom properties.",
  });
}

function assertAllowedKeys(
  value: object,
  allowed: readonly string[],
  path: readonly (string | number)[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new DefinitionDiagnosticError({
        code: "PH-DM-CONFIG-INVALID",
        path: [...path, key],
        message: `Declaration property ${String(key)} is unsupported.`,
        repair: "Remove the property or use a documented declaration member.",
      });
    }
  }
}

function requiredString(
  value: unknown,
  path: readonly (string | number)[],
): string {
  if (typeof value !== "string") {
    throw new DefinitionDiagnosticError({
      code: "PH-DM-CONFIG-INVALID",
      path,
      message: "This declaration value must be a string.",
      repair: "Provide a string value.",
    });
  }
  return value;
}

function normalizeExamples(
  value: unknown,
  path: readonly (string | number)[],
): readonly DefinitionExampleDeclaration[] {
  if (value === undefined) return [];
  const inspected = snapshotDataArray(value);
  if (!inspected.ok) {
    throw new DefinitionDiagnosticError({
      code: "PH-DM-EXAMPLE-INVALID",
      path,
      message: "Examples must be an array.",
      repair: "Use an array of { key, value } declarations.",
    });
  }
  return inspected.value as readonly DefinitionExampleDeclaration[];
}

function normalizeConfig(
  input: unknown,
  contextId: symbol,
): DocumentModelCompilationConfig {
  const config = stableRecord(input, []);
  assertAllowedKeys(
    config,
    [
      "id",
      "name",
      "description",
      "extension",
      "version",
      "author",
      "changeLog",
      "specifications",
    ],
    [],
  );
  if (!Number.isSafeInteger(config.version) || Number(config.version) <= 0) {
    throw new DefinitionDiagnosticError({
      code: "PH-DM-VERSION-INVALID",
      path: ["version"],
      message: "A code-first model version must be a positive safe integer.",
      repair: "Use version: 1 or another positive safe integer.",
    });
  }
  const author = stableRecord(config.author, ["author"]);
  assertAllowedKeys(author, ["name", "website"], ["author"]);
  if (
    author.website !== undefined &&
    author.website !== null &&
    typeof author.website !== "string"
  ) {
    throw new DefinitionDiagnosticError({
      code: "PH-DM-CONFIG-INVALID",
      path: ["author", "website"],
      message: "Author website must be a string, null, or omitted.",
      repair: "Use a URL string, null, or omit website.",
    });
  }
  const specifications = stableRecord(config.specifications, [
    "specifications",
  ]);
  assertAllowedKeys(
    specifications,
    ["auxiliaryTypes", "graphQLCompatibility", "global", "local"],
    ["specifications"],
  );
  const global = stableRecord(specifications.global, [
    "specifications",
    "global",
  ]);
  assertAllowedKeys(
    global,
    ["schema", "initialValue", "examples"],
    ["specifications", "global"],
  );
  const local = stableRecord(specifications.local, ["specifications", "local"]);
  assertAllowedKeys(
    local,
    ["schema", "initialValue", "examples"],
    ["specifications", "local"],
  );
  const auxiliaryTypes =
    specifications.auxiliaryTypes === undefined
      ? Object.freeze([])
      : stableArray(
          specifications.auxiliaryTypes,
          ["specifications", "auxiliaryTypes"],
          "Auxiliary types must be an authored tuple or array.",
        );
  const changeLog =
    config.changeLog === undefined
      ? Object.freeze([])
      : stableArray(
          config.changeLog,
          ["changeLog"],
          "changeLog must be an array of strings.",
        );
  changeLog.forEach((entry, index) =>
    requiredString(entry, ["changeLog", index]),
  );

  return {
    contextId,
    id: requiredString(config.id, ["id"]),
    name: requiredString(config.name, ["name"]),
    description: requiredString(config.description, ["description"]),
    extension: requiredString(config.extension, ["extension"]),
    version: config.version as number,
    author: {
      name: requiredString(author.name, ["author", "name"]),
      website: (author.website ?? null) as string | null,
    },
    changeLog: changeLog as string[],
    specifications: {
      auxiliaryTypes: [...(auxiliaryTypes as AnyTypeDescriptor[])],
      graphQLCompatibility:
        (specifications.graphQLCompatibility as
          | LegacyGraphQLDocumentCompatibilityV1
          | undefined) ?? null,
      global: {
        schema: global.schema as StateRootDescriptor,
        initialValue: global.initialValue,
        examples: normalizeExamples(global.examples, [
          "specifications",
          "global",
          "examples",
        ]),
      },
      local: {
        schema: local.schema as StateRootDescriptor | null,
        initialValue: local.initialValue,
        examples: normalizeExamples(local.examples, [
          "specifications",
          "local",
          "examples",
        ]),
      },
    },
  };
}

function operationBuilder<TState, TScope extends "global" | "local">(
  scope: TScope,
): ModelOperationBuilder<TState, TScope> {
  return ((input: unknown) => {
    const config = stableRecord(input, ["operation"]);
    assertAllowedKeys(
      config,
      [
        "description",
        "input",
        "errors",
        "examples",
        "template",
        "reducerTemplate",
        "reduce",
        "reduceLegacy",
      ],
      ["operation"],
    );
    const descriptor = config.input;
    if (
      !isTypeDescriptor(descriptor) ||
      (descriptor as { readonly kind?: unknown }).kind !== "input"
    ) {
      throw new DefinitionDiagnosticError({
        code: "PH-DM-OPERATION-INPUT-INVALID",
        path: ["operation", "input"],
        message: "A code-first operation requires a ph.input descriptor.",
        repair: "Use input: ph.input({ fields: { ... } }).",
      });
    }
    const hasReducer = typeof config.reduce === "function";
    const hasLegacyReducer = typeof config.reduceLegacy === "function";
    if (hasReducer === hasLegacyReducer) {
      throw new DefinitionDiagnosticError({
        code: "PH-DM-REDUCER-INVALID",
        path: ["operation"],
        message:
          "A code-first operation requires exactly one reducer implementation.",
        repair:
          "Provide either reduce(state, input, ctx) or reduceLegacy(state, action, dispatch).",
      });
    }
    for (const property of [
      "description",
      "template",
      "reducerTemplate",
    ] as const) {
      const value = config[property];
      if (value !== undefined && value !== null && typeof value !== "string") {
        throw new DefinitionDiagnosticError({
          code: "PH-DM-CONFIG-INVALID",
          path: ["operation", property],
          message: `${property} must be a string, null, or omitted.`,
          repair: `Use a string, null, or omit ${property}.`,
        });
      }
    }
    const errors = stableRecord(config.errors ?? {}, ["operation", "errors"]);
    const token: ModelOperationToken = {
      kind: "powerhouse.document-model-operation",
    };
    operationDeclarations.set(token, {
      scope,
      input: descriptor as InputDescriptor,
      description: (config.description as string | undefined) ?? null,
      errors: errors as Record<string, OperationErrorDeclaration>,
      examples: normalizeExamples(config.examples, ["operation", "examples"]),
      template: (config.template as string | null | undefined) ?? null,
      reducerTemplate:
        (config.reducerTemplate as string | null | undefined) ?? null,
      reduce: hasReducer
        ? (config.reduce as RuntimeOperationDeclaration["reduce"])
        : (state, _input, context) =>
            (config.reduceLegacy as LegacyOperationReducer<unknown, never>)(
              state,
              context.action as never,
              context.dispatch,
            ),
    });
    return token;
  }) as ModelOperationBuilder<TState, TScope>;
}

function compileVersion(
  normalized: DocumentModelCompilationConfig,
  modules: readonly ModelModuleToken[],
  compatibility?: LegacySpecificationCompatibility,
): CompiledDocumentModelVersion {
  try {
    const declarations = modules.map((module, index) => {
      const declaration = moduleDeclarations.get(module);
      if (!declaration) {
        throw new DefinitionDiagnosticError({
          code: "PH-DM-MODULE-INVALID",
          path: ["modules", index],
          message: "The finalized value is not a document-model module token.",
          repair: "Pass only values returned by this context.module call.",
        });
      }
      return declaration;
    });
    return compileDocumentModelVersion(normalized, declarations, compatibility);
  } catch (error) {
    return rethrowDefinitionError(error, {
      key: normalized.id,
      version: normalized.version,
    });
  }
}

export function defineDocumentModel<
  const TGlobal extends StateRootDescriptor,
  const TLocal extends StateRootDescriptor | null,
  const TVersion extends number,
>(
  config: DocumentModelConfig<TGlobal, TLocal, TVersion>,
): DocumentModelContext<TGlobal, TLocal, TVersion> {
  const contextId = Symbol("document-model-context");
  let normalized: DocumentModelCompilationConfig;
  try {
    normalized = normalizeConfig(config, contextId);
  } catch (error) {
    return rethrowDefinitionError(error);
  }

  const context: DocumentModelContext<TGlobal, TLocal, TVersion> = {
    module(key, moduleConfig) {
      try {
        const moduleDeclaration = stableRecord(moduleConfig, ["module"]);
        assertAllowedKeys(
          moduleDeclaration,
          ["description", "operations"],
          ["module"],
        );
        const declareOperations = moduleDeclaration.operations;
        if (typeof declareOperations !== "function") {
          throw new DefinitionDiagnosticError({
            code: "PH-DM-MODULE-INVALID",
            path: ["module", "operations"],
            message: "Module operations must be declared by a callback.",
            repair: "Use operations: ({ global, local }) => ({ ... }).",
          });
        }
        if (
          moduleDeclaration.description !== undefined &&
          typeof moduleDeclaration.description !== "string"
        ) {
          throw new DefinitionDiagnosticError({
            code: "PH-DM-MODULE-INVALID",
            path: ["module", "description"],
            message: "Module description must be a string when present.",
            repair: "Use a string or omit description.",
          });
        }
        const declareOperationsCallback = declareOperations as (builders: {
          readonly global: ModelOperationBuilder<
            Mutable<SourceOf<TGlobal>>,
            "global"
          >;
          readonly local: ModelOperationBuilder<
            LocalStateOfDescriptor<TLocal>,
            "local"
          >;
        }) => unknown;
        const operationMap = declareOperationsCallback({
          global: operationBuilder("global"),
          local: operationBuilder("local"),
        });
        const operationDeclarationsByKey = stableRecord(operationMap, [
          "module",
          "operations",
        ]);
        const operations: RuntimeOperationDeclaration[] = [];
        const seenTokens = new Set<ModelOperationToken>();
        for (const [operationKey, candidate] of Object.entries(
          operationDeclarationsByKey,
        )) {
          const token = candidate as ModelOperationToken;
          const declaration = operationDeclarations.get(token);
          if (!declaration) {
            throw new DefinitionDiagnosticError({
              code: "PH-DM-OPERATION-INVALID",
              path: ["module", "operations", operationKey],
              message:
                "An operation entry was not built by global(...) or local(...).",
              repair:
                "Wrap the operation declaration with the supplied scope builder.",
            });
          }
          if (seenTokens.has(token)) {
            throw new DefinitionDiagnosticError({
              code: "PH-DM-OPERATION-INVALID",
              path: ["module", "operations", operationKey],
              message: "One operation token is assigned to more than one key.",
              repair: "Call the scope builder separately for each operation.",
            });
          }
          seenTokens.add(token);
          operations.push({ ...declaration, key: operationKey });
        }
        const token: ModelModuleToken = {
          kind: "powerhouse.document-model-module",
        };
        moduleDeclarations.set(token, {
          contextId,
          key,
          description:
            (moduleDeclaration.description as string | undefined) ?? null,
          operations,
        });
        return token as never;
      } catch (error) {
        return rethrowDefinitionError(error, {
          key: normalized.id,
          version: normalized.version,
        });
      }
    },
    version(versionConfig) {
      try {
        const versionDeclaration = stableRecord(versionConfig, ["version"]);
        assertAllowedKeys(
          versionDeclaration,
          ["modules", "compatibility"],
          ["version"],
        );
        const modules = stableArray(
          versionDeclaration.modules,
          ["modules"],
          "A model version requires an array of module tokens.",
        );
        const plan = compileVersion(
          normalized,
          modules as readonly ModelModuleToken[],
          versionDeclaration.compatibility as
            | LegacySpecificationCompatibility
            | undefined,
        );
        const token: DocumentModelVersionDefinition = {
          kind: "powerhouse.document-model-version",
          version: normalized.version,
          documentType: normalized.id,
        };
        versionPlans.set(token, plan);
        return token as never;
      } catch (error) {
        return rethrowDefinitionError(error, {
          key: normalized.id,
          version: normalized.version,
        });
      }
    },
    finalize(finalizeConfig) {
      const version = context.version(finalizeConfig);
      return defineDocumentModelFamily({
        versions: [version],
        upgrades: [],
      }).at(normalized.version as TVersion) as never;
    },
  };
  return context;
}

function familyError(
  plan: CompiledDocumentModelVersion | undefined,
  issue: ConstructorParameters<typeof DefinitionDiagnosticError>[0],
): never {
  const error = new DefinitionDiagnosticError(issue);
  throw new DocumentModelDefinitionError([
    diagnosticFromError(
      error,
      plan ? { key: plan.config.id, version: plan.config.version } : undefined,
    ),
  ]);
}

export function defineDocumentModelFamily<
  const TVersions extends readonly DocumentModelVersionDefinition[],
>(config: {
  readonly versions: TVersions;
  readonly upgrades: readonly UpgradeTransition[];
}): DocumentModelFamily<TVersions> {
  const inspectedConfig = snapshotDataRecord(config as unknown);
  if (!inspectedConfig.ok) {
    return familyError(undefined, {
      code: "PH-DM-FAMILY-INVALID",
      path: [],
      message:
        "A document-model family declaration must be a plain object with stable data properties.",
      repair: "Pass { versions, upgrades } to defineDocumentModelFamily.",
    });
  }
  const familyConfig = inspectedConfig.value;
  const unsupported = Object.keys(familyConfig).find(
    (key) => !["versions", "upgrades"].includes(key),
  );
  if (unsupported !== undefined) {
    return familyError(undefined, {
      code: "PH-DM-FAMILY-INVALID",
      path: [String(unsupported)],
      message: `Family property ${String(unsupported)} is unsupported.`,
      repair: "Use only versions and upgrades.",
    });
  }
  const inspectedVersions = snapshotDataArray(familyConfig.versions);
  if (!inspectedVersions.ok || inspectedVersions.value.length === 0) {
    return familyError(undefined, {
      code: "PH-DM-FAMILY-INVALID",
      path: ["versions"],
      message: "A document-model family requires at least one version.",
      repair: "Add one value returned by context.version({ modules }).",
    });
  }
  const inspectedUpgrades = snapshotDataArray(familyConfig.upgrades);
  if (!inspectedUpgrades.ok) {
    return familyError(undefined, {
      code: "PH-DM-FAMILY-INVALID",
      path: ["upgrades"],
      message: "Family upgrades must be an array.",
      repair: "Use upgrades: [] or list one transition for each version gap.",
    });
  }
  const plans = inspectedVersions.value.map((version, index) => {
    const plan = versionPlans.get(version as DocumentModelVersionDefinition);
    if (!plan) {
      return familyError(undefined, {
        code: "PH-DM-FAMILY-INVALID",
        path: ["versions", index],
        message: "A family version was not created by defineDocumentModel.",
        repair: "Pass only opaque values returned by context.version().",
      });
    }
    return plan;
  });
  const first = plans[0] as CompiledDocumentModelVersion;
  const firstModel = canonicalJson(
    first.definition.model as unknown as JsonValue,
  );
  const firstCompatibility = canonicalJson(
    first.definition.compatibility as unknown as JsonValue,
  );
  plans.forEach((plan, index) => {
    if (plan.config.id !== first.config.id) {
      familyError(plan, {
        code: "PH-DM-FAMILY-INVALID",
        path: ["versions", index, "documentType"],
        message: "Every family version must use one document type.",
        repair: "Compose versions declared with the same model id.",
      });
    }
    if (
      canonicalJson(plan.definition.model as unknown as JsonValue) !==
      firstModel
    ) {
      familyError(plan, {
        code: "PH-DM-FAMILY-INVALID",
        path: ["versions", index, "model"],
        message: "Family model metadata must remain identical across versions.",
        repair:
          "Use the same name, description, extension, and author for every family version.",
      });
    }
    if (
      canonicalJson(plan.definition.compatibility as unknown as JsonValue) !==
      firstCompatibility
    ) {
      familyError(plan, {
        code: "PH-DM-FAMILY-INVALID",
        path: ["versions", index, "compatibility"],
        message:
          "Every version in a family must use the same compatibility modes.",
        repair:
          "Migrate the complete family together or keep every version on derived identity and canonical serialization.",
      });
    }
    if (
      index > 0 &&
      plan.config.version !== (plans[index - 1]?.config.version ?? 0) + 1
    ) {
      familyError(plan, {
        code: "PH-DM-FAMILY-INVALID",
        path: ["versions", index, "version"],
        message:
          "Code-first family versions must be unique, contiguous, and authored in ascending order.",
        repair: "List every consecutive version once in ascending order.",
      });
    }
  });
  if (inspectedUpgrades.value.length !== Math.max(0, plans.length - 1)) {
    familyError(first, {
      code: "PH-DM-FAMILY-INVALID",
      path: ["upgrades"],
      message:
        "A family requires exactly one upgrade transition for every version gap.",
      repair:
        "Provide one ordered UpgradeTransition for each version after the first.",
    });
  }
  const upgrades: Record<string, UpgradeTransition> = {};
  inspectedUpgrades.value.forEach((upgrade, index) => {
    const expectedVersion = plans[index + 1]?.config.version;
    const inspectedUpgrade = snapshotDataRecord(upgrade);
    if (
      !inspectedUpgrade.ok ||
      inspectedUpgrade.value.toVersion !== expectedVersion ||
      typeof inspectedUpgrade.value.upgradeReducer !== "function" ||
      (inspectedUpgrade.value.description !== undefined &&
        typeof inspectedUpgrade.value.description !== "string")
    ) {
      familyError(plans[index + 1], {
        code: "PH-DM-FAMILY-INVALID",
        path: ["upgrades", index],
        message: `Upgrade ${index} must target version ${expectedVersion}.`,
        repair:
          "Keep transitions in family order and set each toVersion to the next declared version.",
      });
    }
    const validatedUpgrade =
      inspectedUpgrade.value as unknown as UpgradeTransition;
    upgrades[`v${validatedUpgrade.toVersion}`] = Object.freeze({
      toVersion: validatedUpgrade.toVersion,
      upgradeReducer: validatedUpgrade.upgradeReducer,
      ...(validatedUpgrade.description === undefined
        ? {}
        : { description: validatedUpgrade.description }),
    });
  });

  const supportedVersions = Object.freeze(
    plans.map((plan) => plan.config.version),
  );
  const upgradeManifest: UpgradeManifest<readonly number[]> = Object.freeze({
    documentType: first.config.id,
    latestVersion: supportedVersions.at(-1) as number,
    supportedVersions,
    upgrades: Object.freeze(upgrades),
  });
  const behaviors = plans.map((plan) => createCodeFirstRuntimeBehavior(plan));
  const reducers = Object.fromEntries(
    plans.map((plan, index) => [
      plan.config.version,
      asBaseReducer(behaviors[index]!.reducer),
    ]),
  );
  const modules = plans.map((plan, index) =>
    materializeCodeFirstModule({
      plan,
      behavior: behaviors[index]!,
      plans,
      reducers,
      upgradeManifest,
    }),
  );

  const frozenModules = Object.freeze(modules);
  const family: DocumentModelFamily<TVersions> = {
    modules: frozenModules as never,
    upgradeManifest,
    at(version) {
      const module = modules.find((candidate) => candidate.version === version);
      if (!module) {
        throw new RangeError(
          `Document model ${first.config.id} has no version ${version}.`,
        );
      }
      return module as never;
    },
  };
  documentModelFamilyModules.set(
    family,
    frozenModules as readonly CodeFirstDocumentModelModule<
      PHBaseState,
      Actions
    >[],
  );
  return Object.freeze(family);
}
