import type { SubgraphProtocol } from "document-model";
import { type DocumentNode, print } from "graphql";
import { compileSubgraphClass } from "./compile.js";
import type { Subgraph } from "./subgraph.js";

export type AssignedFields = {
  readonly name: string;
  readonly typeDefs: DocumentNode;
  readonly resolvers: Record<string, unknown>;
  readonly hasSubscriptions: boolean;
};

type Assigned = AssignedFields & {
  /** Each resolver function by coordinate, to catch a mutated map. */
  readonly functions: ReadonlyMap<string, unknown>;
  /** `typeDefs` as printed at construction, to catch an edited document. */
  readonly sdl: string;
};

const assignedByInstance = new WeakMap<object, Assigned>();
const protocols = new WeakMap<typeof Subgraph, SubgraphProtocol>();

export function recordAssigned(
  instance: Subgraph,
  sdl: string,
  fields: AssignedFields,
) {
  assignedByInstance.set(instance, {
    ...fields,
    functions: functionsOf(fields.resolvers),
    sdl,
  });
}

/** The protocol of `cls`, which runs in the copy of reactor-api that defined it. */
export function subgraphProtocol(cls: typeof Subgraph): SubgraphProtocol {
  let protocol = protocols.get(cls);
  if (protocol === undefined) {
    protocol = Object.freeze({
      version: 1 as const,
      describe() {
        const compilation = compileSubgraphClass(cls);
        const { name, diagnostics } = compilation;
        return {
          ...(name !== undefined && { name }),
          ...(compilation.kind === "compiled" && {
            definition: compilation.definition,
          }),
          diagnostics,
        };
      },
      validate: validateInstance,
    });
    protocols.set(cls, protocol);
  }
  return protocol;
}

function validateInstance(
  instance: unknown,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  const assigned =
    typeof instance === "object" && instance !== null
      ? assignedByInstance.get(instance)
      : undefined;
  if (assigned === undefined) {
    return {
      ok: false,
      message:
        "the instance was not constructed by this copy's Subgraph constructor",
    };
  }
  const current = instance as Partial<Record<keyof AssignedFields, unknown>>;
  const changed =
    (["name", "typeDefs", "resolvers", "hasSubscriptions"] as const).find(
      (field) => current[field] !== assigned[field],
    ) ??
    (print(assigned.typeDefs) === assigned.sdl ? undefined : "typeDefs") ??
    (sameFunctions(current.resolvers, assigned) ? undefined : "resolvers");
  if (changed === undefined) return { ok: true };
  return {
    ok: false,
    message: `\`${changed}\` differs from what the Subgraph constructor assigned from getSchema. A code-first subgraph declares its schema in getSchema only; remove the field initializer, field declaration or assignment that sets \`${changed}\`.`,
  };
}

function sameFunctions(resolvers: unknown, assigned: Assigned): boolean {
  const current = functionsOf(resolvers as Record<string, unknown>);
  return (
    current.size === assigned.functions.size &&
    [...current].every(
      ([coordinate, value]) => assigned.functions.get(coordinate) === value,
    )
  );
}

function functionsOf(
  resolvers: Record<string, unknown>,
): ReadonlyMap<string, unknown> {
  const functions = new Map<string, unknown>();
  for (const [typeName, fields] of Object.entries(resolvers)) {
    for (const [fieldName, value] of Object.entries(
      fields as Record<string, unknown>,
    )) {
      const coordinate = `${typeName}.${fieldName}`;
      if (typeof value === "object" && value !== null) {
        for (const [step, fn] of Object.entries(value)) {
          functions.set(`${coordinate}.${step}`, fn);
        }
      } else {
        functions.set(coordinate, value);
      }
    }
  }
  return functions;
}
