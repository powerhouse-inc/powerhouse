import type {
  DefinitionDiagnostic,
  ScalarDefinition,
  ScalarRepresentation,
} from "@powerhousedao/shared/document-model";
import { registerScalarFactory } from "../descriptor-registry.js";
import { DocumentModelDefinitionError } from "../diagnostics.js";
import { createScalarField } from "../field-options.js";
import type { FieldOptions } from "../types.js";
import { deriveCoercion } from "./coercion.js";
import {
  PROFILE,
  type ResolvedScalarDeclaration,
  type ScalarDeclaration,
  parseScalarDeclaration,
} from "./declaration.js";
import type {
  ScalarBinding,
  ScalarFactory,
  ScalarFieldFactory,
} from "./types.js";

/**
 * Compiles one scalar declaration into its field factory. Every catalog
 * scalar is declared with it, and so is a package scalar: a scalar the catalog
 * does not hold, which a code-first model or subgraph may still reference.
 */
export function defineScalar<
  const TName extends string,
  const TBuilderName extends string = TName,
  const TRepresentation extends ScalarRepresentation = ScalarRepresentation,
  TBase = unknown,
  TInput = TBase,
>(
  input: ScalarDeclaration<TName, TBuilderName, TRepresentation, TBase, TInput>,
): ScalarFactory<TName, TBuilderName, TBase, TBuilderName, TInput> {
  const declaration = parseScalarDeclaration(
    input,
  ) as ResolvedScalarDeclaration<TName, TBuilderName, TBase, TInput>;
  // Every field use carries the binding, so nothing in it may be the
  // author's own mutable object.
  const { parseValue, parseLiteral, serialize } =
    declaration.coercion ?? deriveCoercion(declaration);
  const coercion = Object.freeze({ parseValue, parseLiteral, serialize });

  const definition = Object.freeze({
    kind: "powerhouse.scalar",
    formatVersion: 1,
    name: declaration.name,
    representation: declaration.representation,
    persistable: declaration.persistable,
    description: declaration.description,
    zero: frozenJson(structuredClone(declaration.zero)),
    coercion: Object.freeze({
      source: declaration.coercion === undefined ? "derived" : "explicit",
    }),
    coercionProfile: PROFILE,
  }) satisfies ScalarDefinition & { readonly name: TName };

  const binding: ScalarBinding = Object.freeze({
    definition,
    validationProfile: PROFILE,
    validator: declaration.validator,
    coercion,
    typescriptType: declaration.typescriptType,
    zodSource: declaration.zodSource,
    typedef: `scalar ${declaration.name}` as const,
  });

  return withRole(
    <const TRequired extends boolean = false>(
      options?: FieldOptions<TRequired>,
    ) =>
      createScalarField<TBase, TRequired, TInput>(
        declaration.name,
        declaration.validator,
        options,
        binding,
      ),
    { declaration, definition, binding },
    declaration.builderName,
  );
}

/**
 * Registers `make` as the factory for one compiled scalar, reached by its
 * author as `call`. The catalog uses it to expose each built-in as `ph.<name>`
 * with the same binding.
 */
export function withRole<
  TName extends string,
  TBuilderName extends string,
  TBase,
  TInput,
  const TCall extends string,
>(
  make: ScalarFieldFactory<TBase, TInput>,
  scalar: Pick<
    ScalarFactory<TName, TBuilderName, TBase, TBuilderName, TInput>,
    "declaration" | "definition" | "binding"
  >,
  call: TCall,
): ScalarFactory<TName, TBuilderName, TBase, TCall, TInput>;
export function withRole(
  make: (options?: FieldOptions<boolean>) => unknown,
  scalar: Pick<ScalarFactory, "declaration" | "definition" | "binding">,
  call: string,
): ScalarFactory {
  const factory = (options?: FieldOptions<boolean>) => make(options);
  return registerScalarFactory(
    Object.freeze(
      Object.assign(factory, {
        role: `field-use factory; call it, as ${call}({ required: true })`,
        kind: "scalar-factory" as const,
        declaration: scalar.declaration,
        definition: scalar.definition,
        binding: scalar.binding,
      }),
    ),
  ) as unknown as ScalarFactory;
}

function frozenJson<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const member of Object.values(value)) frozenJson(member);
    Object.freeze(value);
  }
  return value;
}

export function scalarDiagnostics(
  error: unknown,
): readonly DefinitionDiagnostic[] {
  if (error instanceof DocumentModelDefinitionError) return error.diagnostics;
  throw error;
}
