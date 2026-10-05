import { PROFILE } from "./declaration.js";
import type { ScalarBinding, ScalarCatalogInterface } from "./types.js";

export type ScalarStrings<TName extends string = string> = Readonly<
  Record<TName, string>
>;

/**
 * One string per catalog scalar, read from its binding under the profile
 * generated code has always validated with. Any compiled catalog works, so a
 * catalog extended with package scalars emits them the same way.
 */
function byName<TName extends string>(
  catalog: ScalarCatalogInterface<TName>,
  pick: (binding: ScalarBinding) => string,
): ScalarStrings<TName> {
  return Object.freeze(
    Object.fromEntries(
      catalog.names.map((name) => {
        const binding = catalog.resolve(name, PROFILE);
        if (binding === undefined) {
          throw new Error(
            `Scalar ${name} has no ${PROFILE} binding to generate code from.`,
          );
        }
        return [name, pick(binding)];
      }),
    ),
  ) as ScalarStrings<TName>;
}

/** The TypeScript type generated code gives each scalar. */
export function scalarTypeScriptTypes<TName extends string>(
  catalog: ScalarCatalogInterface<TName>,
): ScalarStrings<TName> {
  return byName(catalog, (binding) => binding.typescriptType);
}

/** The zod source generated code validates each scalar with. */
export function scalarZodSources<TName extends string>(
  catalog: ScalarCatalogInterface<TName>,
): ScalarStrings<TName> {
  return byName(catalog, (binding) => binding.zodSource);
}

/**
 * `names` with `first` leading in its own order, then every other name in
 * catalog order, minus `exclude`.
 *
 * A consumer whose output lists scalars (a generated `schema.graphql`, a
 * subgraph's introspection) pins the order it has always printed in `first`,
 * and a scalar added to the catalog later still reaches it, at the end.
 */
export function orderedScalarNames<const TName extends string>(
  names: readonly TName[],
  first: readonly NoInfer<TName>[],
  exclude: readonly NoInfer<TName>[] = [],
): readonly TName[] {
  const skipped = new Set<string>(exclude);
  const rest = names.filter((name) => !first.includes(name));
  return [...first, ...rest].filter((name) => !skipped.has(name));
}
