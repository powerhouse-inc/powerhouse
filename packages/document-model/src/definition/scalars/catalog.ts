import type {
  CatalogScalarName,
  DefinitionDiagnostic,
  DefinitionPath,
  GraphQLBuiltInScalarName,
  InternalScalarName,
  PowerhouseScalarName,
  ScalarName,
  ScalarValidationProfile,
} from "@powerhousedao/shared/document-model";
import {
  type DefinitionDiagnosticInput,
  DocumentModelDefinitionError,
  createDiagnostic,
  formatDefinitionDiagnostic,
  sortDefinitionDiagnostics,
} from "../diagnostics.js";
import { canonicalDigest } from "../primitives.js";
import { type AnyScalarDeclaration, PROFILE } from "./declaration.js";
import { builtInScalars } from "./declarations/index.js";
import { defineScalar, scalarDiagnostics, withRole } from "./define-scalar.js";
import type {
  CatalogScalar,
  PhScalarFactory,
  ScalarBinding,
  ScalarCatalogBuildResult,
  ScalarCatalogInterface,
  ScalarFactory,
} from "./types.js";

export { scalarDeclarations } from "./declarations/index.js";

const GRAPHQL_BUILT_IN_SCALARS: readonly GraphQLBuiltInScalarName[] = [
  "ID",
  "String",
  "Boolean",
  "Int",
  "Float",
];

function bindingKey(name: string, profile: ScalarValidationProfile): string {
  return JSON.stringify([name, profile]);
}

type CompiledDeclarations = {
  readonly entries: readonly ScalarFactory[];
  readonly diagnostics: readonly DefinitionDiagnostic[];
};

/** One binding a catalog holds, under the name it answers to. */
type CatalogEntry<TName extends string> = {
  readonly name: TName;
  readonly kind: CatalogScalar["kind"];
  readonly binding: ScalarBinding;
};

function entryOf<TName extends string>(scalar: {
  readonly kind: CatalogScalar["kind"];
  readonly definition: { readonly name: TName };
  readonly binding: ScalarBinding;
}): CatalogEntry<TName> {
  return {
    name: scalar.definition.name,
    kind: scalar.kind,
    binding: scalar.binding,
  };
}

/** Every binding an assembled catalog holds, in the order it was assembled. */
function catalogEntries<TName extends string>(
  catalog: ScalarCatalogInterface<TName>,
): readonly CatalogEntry<TName>[] {
  const internalNames = new Set<string>(catalog.internalNames);
  return catalog.names.flatMap((name) =>
    catalog.validationProfiles.flatMap((profile) => {
      const binding = catalog.resolve(name, profile);
      if (binding === undefined) return [];
      const kind = internalNames.has(name)
        ? "internal-scalar"
        : "scalar-factory";
      return [{ name, kind, binding }];
    }),
  );
}

function compileDeclarations(
  declarations: readonly AnyScalarDeclaration[],
): CompiledDeclarations {
  const diagnostics: DefinitionDiagnostic[] = [];
  const entries: ScalarFactory[] = [];
  for (const declaration of declarations) {
    try {
      entries.push(defineScalar(declaration));
    } catch (error) {
      diagnostics.push(...scalarDiagnostics(error));
    }
  }
  return { entries, diagnostics };
}

function assembleCatalog<TName extends string>(
  entries: readonly CatalogEntry<TName>[],
  diagnostics: readonly DefinitionDiagnostic[],
): ScalarCatalogBuildResult<TName> {
  const collected = [...diagnostics];
  const bindings = new Map<string, ScalarBinding>();
  const names: TName[] = [];
  const authorNames: Exclude<TName, InternalScalarName>[] = [];
  const internalNames: Exclude<TName, PowerhouseScalarName>[] = [];
  for (const { name, kind, binding } of entries) {
    const profile = binding.validationProfile;
    const key = bindingKey(name, profile);
    if (bindings.has(key)) {
      collected.push(
        createDiagnostic({
          code: "PH-SCALAR-DUPLICATE-NAME",
          definition: { kind: "scalar", key: name },
          path: ["name"],
          message: `Scalar ${name} is declared twice for profile ${profile}.`,
          repair:
            "Keep one declaration per scalar name and validation profile.",
        }),
      );
      continue;
    }
    bindings.set(key, binding);
    if (names.includes(name)) continue;
    names.push(name);
    if (kind === "internal-scalar") {
      internalNames.push(name as Exclude<TName, PowerhouseScalarName>);
    } else {
      authorNames.push(name as Exclude<TName, InternalScalarName>);
    }
  }

  const definitions = entries.map((entry) => entry.binding.definition);
  const catalogDigest = canonicalDigest(definitions);
  const report = Object.freeze({
    kind: "powerhouse.scalar-catalog" as const,
    formatVersion: 1 as const,
    catalogDigest,
    entries: entries.map(({ name, binding }) => ({
      name,
      validationProfile: binding.validationProfile,
      definitionDigest: canonicalDigest(binding.definition),
      coercionSource: binding.definition.coercion.source,
    })),
    diagnostics: sortDefinitionDiagnostics(collected),
  });
  if (collected.length > 0) return { report };
  const catalog: ScalarCatalogInterface<TName> = Object.freeze({
    names: Object.freeze(names),
    authorNames: Object.freeze(authorNames),
    internalNames: Object.freeze(internalNames),
    validationProfiles: Object.freeze([PROFILE]),
    digest: catalogDigest,
    resolve: (name: string, profile: ScalarValidationProfile) =>
      bindings.get(bindingKey(name, profile)),
  });
  return { catalog, report };
}

/**
 * Compiles author declarations into a catalog, after `base` when one is
 * given. The base's internal scalars stay internal; a declaration cannot add
 * one.
 */
export function buildScalarCatalog(
  declarations: readonly AnyScalarDeclaration[],
  options: { readonly base?: ScalarCatalogInterface<string> } = {},
): ScalarCatalogBuildResult {
  const compiled = compileDeclarations(declarations);
  return assembleCatalog(
    [
      ...(options.base === undefined ? [] : catalogEntries(options.base)),
      ...compiled.entries.map(entryOf),
    ],
    compiled.diagnostics,
  );
}

const built = assembleCatalog(builtInScalars.map(entryOf), []);
if (built.catalog === undefined) {
  throw new Error(
    [
      "The compiler-owned scalar catalog is invalid:",
      ...built.report.diagnostics.map(formatDefinitionDiagnostic),
    ].join("\n"),
  );
}

export const scalarCatalog: ScalarCatalogInterface = built.catalog;

export const REFERENCEABLE_SCALAR_NAMES: readonly ScalarName[] = Object.freeze([
  ...GRAPHQL_BUILT_IN_SCALARS,
  ...scalarCatalog.authorNames,
]);

const REFERENCEABLE_SCALARS: ReadonlySet<string> = new Set<string>(
  REFERENCEABLE_SCALAR_NAMES,
);

const INTERNAL_SCALARS: ReadonlySet<string> = new Set<string>(
  scalarCatalog.internalNames,
);

const HOST_SCALARS: ReadonlySet<string> = new Set<string>([
  ...GRAPHQL_BUILT_IN_SCALARS,
  ...scalarCatalog.names,
]);

/**
 * Whether a document model or subgraph may reference `name`: a GraphQL
 * built-in or an author-facing catalog scalar. A definition references any
 * other scalar only through a factory `defineScalar` returned, which carries
 * the binding the catalog would otherwise supply.
 */
export function isReferenceableScalarName(name: string): name is ScalarName {
  return REFERENCEABLE_SCALARS.has(name);
}

export function isInternalScalarName(name: string): name is InternalScalarName {
  return INTERNAL_SCALARS.has(name);
}

export function internalScalarDiagnostic(
  name: InternalScalarName,
  path: DefinitionPath,
): DefinitionDiagnosticInput {
  return {
    code: "PH-SCALAR-INTERNAL",
    definition: { kind: "scalar", key: name },
    path,
    message: `${name} is internal to the reactor host. A document model or subgraph cannot use it.`,
    repair:
      "Use ph.Unknown() for an unconstrained value, or ph.object(...) for a structured one.",
  };
}

/**
 * Whether the reactor host declares `name` itself: a GraphQL built-in or any
 * catalog scalar, internal ones included.
 */
export function isHostScalarName(
  name: string,
): name is GraphQLBuiltInScalarName | CatalogScalarName {
  return HOST_SCALARS.has(name);
}

/**
 * Every catalog binding, from every copy of this package in the process.
 *
 * A package compiles its `ph` against its own copy and a host reads it with
 * another, possibly of another release whose catalog definitions differ in a
 * description. A binding's origin, not its digest, is what makes it a catalog
 * scalar, so the set is shared the way the descriptor registry is.
 */
const CATALOG_BINDINGS_KEY = Symbol.for(
  "powerhouse.document-model.catalog-bindings.v1",
);
const catalogBindings: WeakSet<object> = ((
  globalThis as { [CATALOG_BINDINGS_KEY]?: WeakSet<object> }
)[CATALOG_BINDINGS_KEY] ??= new WeakSet<object>());
for (const scalar of builtInScalars) catalogBindings.add(scalar.binding);

/** Whether a copy of the compiler-owned catalog declared this binding. */
export function isCatalogBinding(binding: ScalarBinding): boolean {
  return catalogBindings.has(binding);
}
export const scalarCatalogReport = built.report;
export const scalarEntries = Object.freeze(builtInScalars);

type FactoryByBuilder = {
  readonly [
    S in Extract<
      (typeof builtInScalars)[number],
      { readonly kind: "scalar-factory" }
    > as S["declaration"]["builderName"]
  ]: PhScalarFactory<S>;
};

export const scalarFactories: FactoryByBuilder = Object.freeze(
  Object.fromEntries(
    scalarEntries
      .filter((entry) => entry.kind === "scalar-factory")
      .map((entry) => [
        entry.declaration.builderName,
        withRole(entry, entry, `ph.${entry.declaration.builderName}`),
      ]),
  ),
) as FactoryByBuilder;

export function withInternalScalarGuards<T extends object>(
  builders: T,
): Readonly<T> {
  for (const scalar of scalarEntries) {
    if (scalar.kind === "scalar-factory") continue;
    const { name, builderName } = scalar.declaration;
    Object.defineProperty(builders, builderName, {
      enumerable: false,
      get(): never {
        throw new DocumentModelDefinitionError([
          createDiagnostic(internalScalarDiagnostic(name, [builderName])),
        ]);
      },
    });
  }
  return Object.freeze(builders);
}
