import type {
  NamedGraphQLTypeDefinition,
  TypeReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import { printTypeReference } from "./printer.js";

export type InterfaceConformanceProblem = {
  readonly owner: string;
  readonly message: string;
  readonly expected: string;
  readonly received: string;
  readonly repair: string;
};

/**
 * graphql-js `validateSchema`'s implementation rules that a code-first
 * declaration can break, with its messages, over the wire definitions alone:
 * the core cannot depend on the `graphql` runtime. The builders already refuse
 * a non-interface, a repeated interface and, by construction, a cycle, and an
 * interface field cannot declare arguments.
 */
export function interfaceConformanceProblems(
  definitions: readonly NamedGraphQLTypeDefinition[],
): InterfaceConformanceProblem[] {
  const byName = new Map(
    definitions.map((definition) => [definition.name, definition]),
  );
  const problems: InterfaceConformanceProblem[] = [];
  for (const owner of definitions) {
    if (owner.kind !== "object" && owner.kind !== "interface") continue;
    const implemented = owner.implements ?? [];
    for (const name of implemented) {
      const iface = byName.get(name);
      if (iface?.kind !== "interface") continue;
      for (const ancestor of iface.implements ?? []) {
        if (implemented.includes(ancestor)) continue;
        problems.push({
          owner: owner.name,
          message: `Type ${owner.name} must implement ${ancestor} because it is implemented by ${iface.name}.`,
          expected: `explicit implementation of ${ancestor}`,
          received: `implements ${iface.name}`,
          repair: `Add ${ancestor} to ${owner.name}'s implemented interfaces.`,
        });
      }
      for (const ifaceField of iface.fields) {
        const expected = `${iface.name}.${ifaceField.name}`;
        const received = `${owner.name}.${ifaceField.name}`;
        const field = owner.fields.find(({ name }) => name === ifaceField.name);
        if (field === undefined) {
          problems.push({
            owner: owner.name,
            message: `Interface field ${expected} expected but ${owner.name} does not provide it.`,
            expected: `${expected}: ${printTypeReference(ifaceField.type)}`,
            received: "missing field",
            repair: `Add ${ifaceField.name} with a type compatible with ${expected}, or remove ${iface.name} from ${owner.name}'s implemented interfaces.`,
          });
        } else if (!isSubType(byName, field.type, ifaceField.type)) {
          problems.push({
            owner: owner.name,
            message: `Interface field ${expected} expects type ${printTypeReference(ifaceField.type)} but ${received} is type ${printTypeReference(field.type)}.`,
            expected: printTypeReference(ifaceField.type),
            received: printTypeReference(field.type),
            repair: `Give ${received} a type compatible with ${expected}.`,
          });
        }
      }
    }
  }
  return problems;
}

/** graphql-js `isTypeSubTypeOf`. */
function isSubType(
  byName: ReadonlyMap<string, NamedGraphQLTypeDefinition>,
  candidate: TypeReferenceDefinition,
  target: TypeReferenceDefinition,
): boolean {
  if (target.required && !candidate.required) return false;
  if (candidate.kind === "list" || target.kind === "list") {
    return (
      candidate.kind === "list" &&
      target.kind === "list" &&
      isSubType(byName, candidate.item, target.item)
    );
  }
  if (candidate.name === target.name) return true;
  const abstract = byName.get(target.name);
  if (abstract?.kind === "union")
    return abstract.members.includes(candidate.name);
  const member = byName.get(candidate.name);
  return (
    abstract?.kind === "interface" &&
    (member?.kind === "object" || member?.kind === "interface") &&
    member.implements?.includes(abstract.name) === true
  );
}
