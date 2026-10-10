import type {
  DefinitionDiagnostic,
  GraphQLBuiltInScalarName,
  ScalarName,
  ScalarValidationProfile,
} from "@powerhousedao/shared/document-model";
import {
  createDiagnostic,
  formatDefinitionDiagnostic,
  sortDefinitionDiagnostics,
} from "../diagnostics.js";
import { canonicalDigest } from "../primitives.js";
import { type AnyScalarDeclaration, PROFILE } from "./declaration.js";
import { builtInScalars, scalarDeclarations } from "./declarations/index.js";
import { defineScalar, scalarDiagnostics, withRole } from "./define-scalar.js";
import type {
  PhScalarFactory,
  ScalarBinding,
  ScalarCatalogBuildResult,
  ScalarCatalogInterface,
  ScalarFactory,
} from "./types.js";

export { scalarDeclarations } from "./declarations/index.js";

export const SCALAR_CATALOG_NAMES = Object.freeze(
  scalarDeclarations.map((declaration) => declaration.name),
);

const GRAPHQL_BUILT_IN_SCALARS: readonly GraphQLBuiltInScalarName[] = [
  "ID",
  "String",
  "Boolean",
  "Int",
  "Float",
];
const REFERENCEABLE_SCALARS: ReadonlySet<string> = new Set<string>([
  ...GRAPHQL_BUILT_IN_SCALARS,
  ...SCALAR_CATALOG_NAMES,
]);

/**
 * Whether `name` is a GraphQL built-in or a catalog scalar. A definition
 * references any other scalar only through a factory `defineScalar` returned,
 * which carries the binding the catalog would otherwise supply.
 */
export function isReferenceableScalarName(name: string): name is ScalarName {
  return REFERENCEABLE_SCALARS.has(name);
}

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
  readonly binding: ScalarBinding;
};

function entryOf<TName extends string>(
  scalar: ScalarFactory<TName>,
): CatalogEntry<TName> {
  return { name: scalar.definition.name, binding: scalar.binding };
}

/** Every binding an assembled catalog holds, in the order it was assembled. */
function catalogEntries<TName extends string>(
  catalog: ScalarCatalogInterface<TName>,
): readonly CatalogEntry<TName>[] {
  return catalog.names.flatMap((name) =>
    catalog.validationProfiles.flatMap((profile) => {
      const binding = catalog.resolve(name, profile);
      return binding === undefined ? [] : [{ name, binding }];
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
  for (const { name, binding } of entries) {
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
    if (!names.includes(name)) names.push(name);
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
    validationProfiles: Object.freeze([PROFILE]),
    digest: catalogDigest,
    resolve: (name: string, profile: ScalarValidationProfile) =>
      bindings.get(bindingKey(name, profile)),
  });
  return { catalog, report };
}

/** Compiles declarations into a catalog, after `base` when one is given. */
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
    S in (typeof builtInScalars)[number] as S["declaration"]["builderName"]
  ]: PhScalarFactory<S>;
};

/** Every catalog scalar as `ph` exposes it: the same binding, a `ph.` role. */
export const scalarFactories: FactoryByBuilder = Object.freeze(
  Object.fromEntries(
    scalarEntries.map((entry) => [
      entry.declaration.builderName,
      withRole(entry, entry, `ph.${entry.declaration.builderName}`),
    ]),
  ),
) as FactoryByBuilder;
