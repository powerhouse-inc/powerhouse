import type { GraphQLResolveInfo } from "graphql";
import type { Context } from "../types.js";
import type { SubgraphBindings } from "./compile.js";
import type { Subgraph } from "./subgraph.js";

type FieldResolver = (
  parent: unknown,
  args: unknown,
  request: Context,
  info: GraphQLResolveInfo,
) => unknown;

type TypeResolver = (
  value: unknown,
  request: Context,
  info: GraphQLResolveInfo,
) => unknown;

type TypeResolvers = Record<
  string,
  | FieldResolver
  | { subscribe: FieldResolver; resolve?: FieldResolver }
  | TypeResolver
>;

export function bindResolvers(
  bindings: SubgraphBindings,
  subgraph: Subgraph,
): Record<string, TypeResolvers> {
  // Names such as `constructor` and `__proto__` must become own properties
  // rather than reach Object.prototype, so the buckets are Maps until the end.
  const resolvers = new Map<string, Map<string, TypeResolvers[string]>>();
  const on = (typeName: string) => {
    let bucket = resolvers.get(typeName);
    if (bucket === undefined) {
      bucket = new Map();
      resolvers.set(typeName, bucket);
    }
    return bucket;
  };
  for (const binding of bindings.values()) {
    switch (binding.kind) {
      case "query":
      case "mutation":
        on(binding.typeName).set(binding.fieldName, (_, args, request, info) =>
          binding.resolve({ parent: undefined, args, request, info, subgraph }),
        );
        break;
      case "computed-field":
        on(binding.typeName).set(
          binding.fieldName,
          (parent, args, request, info) =>
            binding.resolve({ parent, args, request, info, subgraph }),
        );
        break;
      case "subscription": {
        const { resolve } = binding;
        on(binding.typeName).set(binding.fieldName, {
          subscribe: (_, args, request, info) =>
            binding.subscribe({
              parent: undefined,
              args,
              request,
              info,
              subgraph,
            }),
          ...(resolve && {
            resolve: (event, args, request, info) =>
              resolve({ parent: event, args, request, info, subgraph }),
          }),
        });
        break;
      }
      case "resolve-type": {
        const resolveType: TypeResolver = (value, request, info) =>
          binding.resolveType({ value, request, info, subgraph });
        on(binding.typeName).set("__resolveType", resolveType);
        break;
      }
    }
  }
  return Object.fromEntries(
    [...resolvers].map(([typeName, fields]) => [
      typeName,
      Object.fromEntries(fields),
    ]),
  );
}
