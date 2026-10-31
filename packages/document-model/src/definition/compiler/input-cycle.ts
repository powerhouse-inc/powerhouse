import type {
  InputTypeDefinition,
  NamedGraphQLTypeDefinition,
} from "@powerhousedao/shared/document-model";

export type InputCycleField = {
  readonly owner: string;
  readonly key: string;
};

type InputCycle = {
  readonly input: string;
  readonly fields: readonly InputCycleField[];
};

export function nonNullInputCycles(
  definitions: readonly NamedGraphQLTypeDefinition[],
): InputCycle[] {
  const inputs = new Map(
    definitions
      .filter(
        (definition): definition is InputTypeDefinition =>
          definition.kind === "input",
      )
      .map((input) => [input.name, input]),
  );
  const visited = new Set<string>();
  const path: InputCycleField[] = [];
  const pathIndex = new Map<string, number>();
  const cycles: InputCycle[] = [];

  const visit = (input: InputTypeDefinition): void => {
    if (visited.has(input.name)) return;
    visited.add(input.name);
    pathIndex.set(input.name, path.length);
    for (const field of input.fields) {
      if (field.type.kind !== "named" || !field.type.required) continue;
      const target = inputs.get(field.type.name);
      if (target === undefined) continue;
      const cycleStart = pathIndex.get(target.name);
      path.push({ owner: input.name, key: field.key });
      if (cycleStart === undefined) visit(target);
      else cycles.push({ input: target.name, fields: path.slice(cycleStart) });
      path.pop();
    }
    pathIndex.delete(input.name);
  };

  for (const input of inputs.values()) visit(input);
  return cycles;
}
