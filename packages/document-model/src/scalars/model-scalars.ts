import type { ScalarDefinition } from "./types.js";

type CompiledScalars = WeakMap<object, ReadonlyMap<string, ScalarDefinition>>;

const COMPILED_SCALARS = Symbol.for("powerhouse.model-package-scalars");

function compiledScalars(): CompiledScalars {
  const holder = globalThis as { [COMPILED_SCALARS]?: CompiledScalars };
  return (holder[COMPILED_SCALARS] ??= new WeakMap());
}

const NONE: ReadonlyMap<string, ScalarDefinition> = new Map();

/**
 * @experimental The `defineScalar` definitions a materialized model was
 * compiled with, by name. A stored definition records only their metadata, so
 * this is the only place their validators survive. Empty for a model that
 * `materialize` did not make.
 */
export function modelPackageScalars(
  model: unknown,
): ReadonlyMap<string, ScalarDefinition> {
  if (typeof model !== "object" || model === null) return NONE;
  let definition: unknown;
  try {
    definition = (model as { definition?: unknown }).definition;
  } catch {
    return NONE;
  }
  return typeof definition === "object" && definition !== null
    ? (compiledScalars().get(definition) ?? NONE)
    : NONE;
}

export function recordModelPackageScalars(
  definition: object,
  scalars: ReadonlyMap<string, ScalarDefinition>,
): void {
  if (scalars.size > 0) compiledScalars().set(definition, scalars);
}
