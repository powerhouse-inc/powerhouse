import type {
  Condition,
  DocumentModelSpecificationDefinition,
  InitialAuthTemplate,
  Operand,
  TypeReferenceDefinition,
  NamedGraphQLTypeDefinition,
} from "@powerhousedao/shared/document-model";
import { parseInitialAuthTemplate } from "@powerhousedao/shared/document-model";
import { z } from "zod";
import { getCatalogScalar } from "../../scalars/catalog.js";
import { authPlatformScopes, authPlatformState } from "./platform.js";
import { fieldSchemas, isPrimitiveSchema, acceptsPrimitive } from "./schema.js";

function invalid(message: string): never {
  throw new TypeError(message);
}
const builtIns: Readonly<Partial<Record<string, z.ZodType>>> = {
  ID: z.string(),
  String: z.string(),
  Int: z.number().int(),
  Float: z.number(),
  Boolean: z.boolean(),
};

export function validateInitialAuthSpecification(
  specification: DocumentModelSpecificationDefinition,
  documentType: string,
): InitialAuthTemplate | undefined {
  if (specification.initialAuth === undefined) return undefined;
  const template = parseInitialAuthTemplate(
    specification.initialAuth,
    documentType,
  );
  const types = new Map(specification.types.map((type) => [type.name, type]));
  const schemaCache = new Map<string, z.ZodType>();
  function named(type: NamedGraphQLTypeDefinition): z.ZodType {
    const existing = schemaCache.get(type.name);
    if (existing) return existing;
    const schema: z.ZodType = z.lazy(() => {
      if (type.kind === "enum")
        return z.enum(type.values.map((value) => value.name));
      if (type.kind === "union")
        return z.union(
          type.members.map((name) => {
            const member = types.get(name);
            return member
              ? named(member)
              : invalid(`Unknown union member ${name}.`);
          }),
        );
      return z.object(
        Object.fromEntries(
          type.fields.map((field) => [field.name, reference(field.type)]),
        ),
      );
    });
    schemaCache.set(type.name, schema);
    return schema;
  }
  function reference(type: TypeReferenceDefinition): z.ZodType {
    let schema: z.ZodType;
    if (type.kind === "list") schema = z.array(reference(type.item));
    else if (type.kind === "named") {
      const definition = types.get(type.name);
      schema = definition
        ? named(definition)
        : invalid(`Unknown authorization type ${type.name}.`);
    } else {
      const catalog =
        builtIns[type.name] ?? getCatalogScalar(type.name)?.schema;
      const scalar = specification.scalars.find(
        (candidate) => candidate.name === type.name,
      );
      const representation =
        scalar && "definition" in scalar
          ? scalar.definition.representation
          : undefined;
      schema =
        catalog ??
        (representation === "string"
          ? z.string()
          : representation === "number"
            ? z.number()
            : representation === "boolean"
              ? z.boolean()
              : z.unknown());
    }
    return type.required ? schema : schema.nullish();
  }
  const operations = new Map<string, { scope: string; input: z.ZodType }>(
    specification.modules.flatMap((module) =>
      module.operations.map(
        (operation) =>
          [
            operation.actionType,
            {
              scope: operation.scope,
              input: operation.input ? named(operation.input) : z.object({}),
            },
          ] as const,
      ),
    ),
  );
  for (const [scope, entries] of authPlatformScopes())
    for (const operation of Object.values(entries))
      operations.set(operation.actionType, { scope, input: operation.input });
  for (const grant of template.grants) {
    const scope = grant.capability.scope;
    if (
      scope !== "global" &&
      scope !== "local" &&
      scope !== "auth" &&
      scope !== "document" &&
      scope !== "header"
    )
      invalid(`Unknown or wildcard scope in typed grant ${grant.id}.`);
    const names =
      grant.capability.can === "execute"
        ? grant.capability.operation
        : undefined;
    if (names !== undefined) {
      if (names.length === 0)
        invalid(`Grant ${grant.id} has an empty operation list.`);
      for (const name of names) {
        const operation = operations.get(name);
        if (operation?.scope !== scope)
          invalid(
            `Grant ${grant.id} references an unknown operation or the wrong scope: ${name}.`,
          );
      }
    }
    const input =
      names?.length === 1 ? operations.get(names[0])?.input : undefined;
    const root =
      scope === "global" || scope === "local"
        ? specification.state[scope].root
        : null;
    const state =
      scope === "global" || scope === "local"
        ? root
          ? reference(root)
          : z.object({})
        : scope === "header"
          ? z.never()
          : authPlatformState[scope];
    function operandSchema(operand: Operand, primitive: boolean): z.ZodType {
      if ("lit" in operand) return z.literal(operand.lit);
      const path = operand.attr.split(".");
      let schema: z.ZodType;
      if (
        path[0] === "subject" &&
        path.length === 2 &&
        ["address", "key"].includes(path[1])
      )
        return z.string().optional();
      if (path[0] === "doc" && path[1] === scope && scope !== "header") {
        schema = state;
        path.splice(0, 2);
      } else if (
        path[0] === "action" &&
        path[1] === "input" &&
        input !== undefined
      ) {
        schema = input;
        path.splice(0, 2);
      } else
        return invalid(
          `Unknown or unavailable authorization path ${operand.attr}.`,
        );
      for (const key of path) {
        const fields = fieldSchemas(schema);
        if (!Object.hasOwn(fields, key))
          return invalid(`Unknown authorization path ${operand.attr}.`);
        schema = fields[key];
      }
      if (primitive && !isPrimitiveSchema(schema))
        invalid(
          `Authorization comparison path ${operand.attr} is not primitive.`,
        );
      return schema;
    }
    function comparison(left: Operand, right: Operand, ordered: boolean): void {
      const leftSchema = operandSchema(left, true);
      const rightSchema = operandSchema(right, true);
      if ("lit" in right && !leftSchema.safeParse(right.lit).success)
        invalid(
          `Grant ${grant.id} has a comparison literal outside its field type.`,
        );
      const kinds = ordered
        ? ["string", "number"]
        : ["string", "number", "boolean", "null"];
      if (
        !kinds.some(
          (kind) =>
            acceptsPrimitive(leftSchema, kind) &&
            acceptsPrimitive(rightSchema, kind),
        )
      )
        invalid(`Grant ${grant.id} compares incompatible field types.`);
    }
    function condition(node: Condition): void {
      if ("and" in node) return node.and.forEach(condition);
      if ("or" in node) return node.or.forEach(condition);
      if ("not" in node) return condition(node.not);
      if ("exists" in node) {
        operandSchema(node.exists, false);
        return;
      }
      if ("in" in node || "notIn" in node) {
        const [left, items] = "in" in node ? node.in : node.notIn;
        operandSchema(left, true);
        items.forEach((right) => comparison(left, right, false));
        return;
      }
      const pair =
        "eq" in node
          ? node.eq
          : "ne" in node
            ? node.ne
            : "lt" in node
              ? node.lt
              : "lte" in node
                ? node.lte
                : "gt" in node
                  ? node.gt
                  : node.gte;
      comparison(pair[0], pair[1], !("eq" in node || "ne" in node));
    }
    if (grant.where) condition(grant.where);
    if ("match" in grant.principal) condition(grant.principal.match);
  }
  return template;
}
