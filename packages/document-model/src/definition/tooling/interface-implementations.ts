import type {
  DefinitionDiagnostic,
  DefinitionPath,
  DocumentModelSpecificationDefinition,
} from "@powerhousedao/shared/document-model";
import {
  buildASTSchema,
  isEqualType,
  isInterfaceType,
  isObjectType,
  isRequiredArgument,
  isTypeDefinitionNode,
  isTypeSubTypeOf,
  Kind,
  specifiedScalarTypes,
  type DocumentNode,
  type GraphQLNamedType,
} from "graphql";
import type { NormalizedDocumentModelArtifact } from "../adapters/types.js";
import { createDiagnostic, sortDefinitionDiagnostics } from "../diagnostics.js";
import {
  documentModelGraphQLProjection,
  foldTypeExtensions,
} from "../graphql-ast.js";
import { scalarCatalog } from "../scalars/catalog.js";
import { schemaFirstGraphQLDocument } from "./graphql-document.js";

const DEFINITION_KINDS = {
  ObjectTypeDefinition: Kind.OBJECT_TYPE_DEFINITION,
  InterfaceTypeDefinition: Kind.INTERFACE_TYPE_DEFINITION,
  InputObjectTypeDefinition: Kind.INPUT_OBJECT_TYPE_DEFINITION,
  EnumTypeDefinition: Kind.ENUM_TYPE_DEFINITION,
  UnionTypeDefinition: Kind.UNION_TYPE_DEFINITION,
} as const;

function buildProjectedSchema(
  specification: DocumentModelSpecificationDefinition,
  specIndex: number,
) {
  const projection = documentModelGraphQLProjection(specification);
  const document =
    projection.kind === "graphql-ast-v1"
      ? projection.document
      : schemaFirstGraphQLDocument(projection.segments).document;
  const documentPath: DefinitionPath = [
    "specifications",
    specIndex,
    "graphQLCompatibility",
    "document",
  ];
  const folded = foldTypeExtensions(document.definitions, documentPath);
  const typeIndices = new Map(
    specification.types.map((type, index) => [type.name, index]),
  );
  const owners = [...folded.types.values()].flatMap(({ node, index }) => {
    if (
      (node.kind !== "ObjectTypeDefinition" &&
        node.kind !== "InterfaceTypeDefinition") ||
      (node.interfaces?.length ?? 0) === 0
    )
      return [];
    const typeIndex = typeIndices.get(node.name.value);
    const path: DefinitionPath =
      typeIndex === undefined
        ? [...documentPath, "definitions", index]
        : ["specifications", specIndex, "types", typeIndex];
    return [
      {
        name: node.name.value,
        kind: node.kind === "ObjectTypeDefinition" ? "object" : "interface",
        path,
      },
    ];
  });
  if (owners.length === 0) return undefined;
  // The validated wire AST uses string literals where graphql-js uses enums.
  const definitions = [...(document as unknown as DocumentNode).definitions];
  const declared = new Set(
    definitions.flatMap((node) =>
      isTypeDefinitionNode(node) ? [node.name.value] : [],
    ),
  );
  for (const scalar of specifiedScalarTypes) declared.add(scalar.name);
  for (const name of [
    ...scalarCatalog.names,
    ...specification.scalars.map((scalar) => scalar.name),
  ]) {
    if (declared.has(name)) continue;
    declared.add(name);
    definitions.push({
      kind: Kind.SCALAR_TYPE_DEFINITION,
      name: { kind: Kind.NAME, value: name },
    });
  }
  for (const { node } of folded.types.values()) {
    if (declared.has(node.name.value)) continue;
    // Compatibility permits extension-only types. Let graphql-js compose
    // their members against an empty base, without duplicating the extension.
    declared.add(node.name.value);
    definitions.push({
      kind: DEFINITION_KINDS[node.kind],
      name: { kind: Kind.NAME, value: node.name.value },
    });
  }
  const schema = buildASTSchema(
    { kind: Kind.DOCUMENT, definitions },
    { assumeValidSDL: true },
  );
  return { schema, owners };
}

export function checkInterfaceImplementations(
  artifact: NormalizedDocumentModelArtifact,
): readonly DefinitionDiagnostic[] {
  const diagnostics: DefinitionDiagnostic[] = [];
  artifact.definition.specifications.forEach((specification, specIndex) => {
    const definition = {
      kind: "document-model" as const,
      key: artifact.documentType,
      version: specification.version,
    };
    let projected: ReturnType<typeof buildProjectedSchema>;
    try {
      projected = buildProjectedSchema(specification, specIndex);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      diagnostics.push(
        createDiagnostic({
          code: "PH-DM-INTERFACE-INVALID",
          source: artifact.source,
          definition,
          path: ["specifications", specIndex],
          message: `Cannot check interface implementations: ${error.message}`,
          repair:
            "Correct the GraphQL type declarations so their interface implementations can be checked.",
        }),
      );
      return;
    }
    if (projected === undefined) return;
    const { schema, owners } = projected;
    for (const type of owners) {
      const report = (
        message: string,
        expected: string,
        received: string,
        repair: string,
      ): void => {
        diagnostics.push(
          createDiagnostic({
            code: "PH-DM-INTERFACE-INVALID",
            source: artifact.source,
            definition,
            path: type.path,
            message,
            expected,
            received,
            repair,
          }),
        );
      };
      const owner = schema.getType(type.name);
      if (!isObjectType(owner) && !isInterfaceType(owner)) {
        report(
          `Type ${type.name} is not an object or interface in its GraphQL projection.`,
          type.kind,
          owner === undefined ? "missing type" : String(owner),
          `Keep ${type.name}'s GraphQL projection consistent with its declared type.`,
        );
        continue;
      }
      const interfaces: readonly GraphQLNamedType[] = owner.getInterfaces();
      const seen = new Set<string>();
      for (const iface of interfaces) {
        const repair = `Make ${owner.name} satisfy ${iface.name}, or remove ${iface.name} from its implemented interfaces.`;
        if (!isInterfaceType(iface)) {
          report(
            `Type ${owner.name} must only implement Interface types, it cannot implement ${iface.name}.`,
            "an interface",
            String(iface),
            repair,
          );
          continue;
        }
        if (owner === iface) {
          report(
            `Type ${owner.name} cannot implement itself because it would create a circular reference.`,
            "an interface other than itself",
            iface.name,
            `Remove ${owner.name} from its own implemented interfaces.`,
          );
          continue;
        }
        if (seen.has(iface.name)) {
          report(
            `Type ${owner.name} can only implement ${iface.name} once.`,
            "one implementation per interface",
            `repeated ${iface.name}`,
            `Remove the repeated ${iface.name} from ${owner.name}'s implemented interfaces.`,
          );
          continue;
        }
        seen.add(iface.name);
        for (const ancestor of iface.getInterfaces()) {
          if (interfaces.includes(ancestor)) continue;
          report(
            ancestor === owner
              ? `Type ${owner.name} cannot implement ${iface.name} because it would create a circular reference.`
              : `Type ${owner.name} must implement ${ancestor.name} because it is implemented by ${iface.name}.`,
            `explicit implementation of ${ancestor.name}`,
            `implements ${iface.name}`,
            ancestor === owner
              ? `Remove the circular implementation between ${owner.name} and ${iface.name}.`
              : `Add ${ancestor.name} to ${owner.name}'s implemented interfaces.`,
          );
        }
        const fields = new Map(
          Object.values(owner.getFields()).map((field) => [field.name, field]),
        );
        for (const ifaceField of Object.values(iface.getFields())) {
          const field = fields.get(ifaceField.name);
          const expected = `${iface.name}.${ifaceField.name}`;
          const received = `${owner.name}.${ifaceField.name}`;
          if (field === undefined) {
            report(
              `Interface field ${expected} expected but ${owner.name} does not provide it.`,
              `${expected}: ${String(ifaceField.type)}`,
              "missing field",
              `Add ${ifaceField.name} with a type compatible with ${expected}, or remove ${iface.name} from ${owner.name}'s implemented interfaces.`,
            );
            continue;
          }
          if (!isTypeSubTypeOf(schema, field.type, ifaceField.type)) {
            report(
              `Interface field ${expected} expects type ${String(ifaceField.type)} but ${received} is type ${String(field.type)}.`,
              String(ifaceField.type),
              String(field.type),
              `Give ${received} a type compatible with ${expected}.`,
            );
          }
          for (const ifaceArg of ifaceField.args) {
            const arg = field.args.find((arg) => arg.name === ifaceArg.name);
            if (arg === undefined) {
              report(
                `Interface field argument ${expected}(${ifaceArg.name}:) expected but ${received} does not provide it.`,
                `${ifaceArg.name}: ${String(ifaceArg.type)}`,
                "missing argument",
                `Add the ${ifaceArg.name} argument to ${received} with type ${String(ifaceArg.type)}.`,
              );
            } else if (!isEqualType(ifaceArg.type, arg.type)) {
              report(
                `Interface field argument ${expected}(${ifaceArg.name}:) expects type ${String(ifaceArg.type)} but ${received}(${ifaceArg.name}:) is type ${String(arg.type)}.`,
                String(ifaceArg.type),
                String(arg.type),
                `Give ${received}(${arg.name}:) exactly the type ${String(ifaceArg.type)}.`,
              );
            }
          }
          for (const arg of field.args) {
            if (
              !ifaceField.args.some((ifaceArg) => ifaceArg.name === arg.name) &&
              isRequiredArgument(arg)
            ) {
              report(
                `Object field ${received} includes required argument ${arg.name} that is missing from the Interface field ${expected}.`,
                "an optional additional argument",
                `${arg.name}: ${String(arg.type)}`,
                `Make ${received}(${arg.name}:) optional, give it a valid default, or declare it on ${expected}.`,
              );
            }
          }
        }
      }
    }
  });
  return sortDefinitionDiagnostics(diagnostics);
}
