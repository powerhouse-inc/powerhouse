import type {
  DocumentScalarReferenceDefinition,
  InputTypeDefinition,
  NamedGraphQLTypeDefinition,
  PowerhouseScalarName,
  StoredScalarDefinition,
  TypeReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import { documentModelScalars } from "../../scalars/catalog.js";
import type { ScalarDefinition } from "../../scalars/types.js";
import { compareCodeUnits } from "../kernel/primitives.js";

function storedScalarDefinition(
  definition: ScalarDefinition,
): StoredScalarDefinition {
  return {
    kind: "powerhouse.scalar",
    formatVersion: 1,
    name: definition.name,
    representation: definition.representation ?? "json",
    description: definition.description ?? "",
    coercion: {
      source: definition.coercion === undefined ? "derived" : "explicit",
    },
    coercionProfile: "catalog-v1",
  };
}

export function scalarReferences(
  catalogScalars: ReadonlySet<string>,
  packageScalars: ReadonlyMap<string, ScalarDefinition>,
): readonly DocumentScalarReferenceDefinition[] {
  const catalog = documentModelScalars
    .map(({ name }) => name as PowerhouseScalarName)
    .filter((name) => catalogScalars.has(name))
    .map(
      (name) =>
        ({
          name,
          implementation: `powerhouse.catalog#${name}`,
          coercionProfile: "catalog-v1",
        }) as DocumentScalarReferenceDefinition,
    );
  const declared = [...packageScalars]
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([name, definition]): DocumentScalarReferenceDefinition => ({
      name,
      implementation: `package#${name}`,
      coercionProfile: "catalog-v1",
      definition: storedScalarDefinition(definition),
    }));
  return [...catalog, ...declared];
}

// The host builds its schema from state SDL and drops scalar declarations from
// operation SDL, so a scalar only local state or an operation input uses is
// declared in the global segment too.
export function declareProjectScalars(
  segment: string,
  packageScalars: ReadonlyMap<string, ScalarDefinition>,
): string {
  return [
    ...[...packageScalars.keys()]
      .sort(compareCodeUnits)
      .map((name) => `scalar ${name}`),
    segment,
  ].join("\n\n");
}

function namedTypeOf(type: TypeReferenceDefinition): string {
  return type.kind === "list" ? namedTypeOf(type.item) : type.name;
}

export function inputReachesProjectScalar(
  input: InputTypeDefinition,
  types: readonly NamedGraphQLTypeDefinition[],
  packageScalars: ReadonlyMap<string, ScalarDefinition>,
): boolean {
  const visited = new Set<string>();
  const reaches = (candidate: InputTypeDefinition): boolean => {
    if (visited.has(candidate.name)) return false;
    visited.add(candidate.name);
    return candidate.fields.some((field) => {
      const name = namedTypeOf(field.type);
      if (packageScalars.has(name)) return true;
      const target = types.find((type) => type.name === name);
      return target?.kind === "input" && reaches(target);
    });
  };
  return reaches(input);
}
