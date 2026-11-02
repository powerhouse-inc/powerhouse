import { z } from "zod";
import type { ScalarRepresentation } from "./types.js";

// defineScalar refuses a schema whose output is not JSON, so a package
// scalar's values are never opaque.
export type JsonRepresentation = Exclude<ScalarRepresentation, "opaque">;

// "null" is tracked through intersections and dropped before deciding: the
// SDL owns nullability, so a null value never decides a representation.
type JsonShape = JsonRepresentation | "null";

const shapeOfJsonType: Readonly<Record<string, JsonShape | undefined>> = {
  null: "null",
  string: "string",
  number: "number",
  integer: "number",
  boolean: "boolean",
  object: "json-object",
  array: "json",
};

function shapeOfValue(value: unknown): JsonShape | undefined {
  if (value === null) return "null";
  if (Array.isArray(value)) return "json";
  if (typeof value === "object") return "json-object";
  return shapeOfJsonType[typeof value];
}

/**
 * The shapes a value of `node` can have, or `undefined` when zod states none.
 * A union allows each branch's shapes; an intersection only those every
 * stated member allows. `root` holds the `$defs` a local `$ref` names.
 */
function jsonShapes(
  node: unknown,
  root: Readonly<Record<string, unknown>>,
  visiting: ReadonlySet<unknown> = new Set(),
): ReadonlySet<JsonShape> | undefined {
  if (typeof node !== "object" || node === null || visiting.has(node)) {
    return undefined;
  }
  const inner = new Set([...visiting, node]);
  const record = node as Record<string, unknown>;
  const { type, anyOf, oneOf, allOf } = record;
  const stated: ReadonlySet<JsonShape>[] = [];
  const statedValues = (shapes: (JsonShape | undefined)[]) => {
    if (!shapes.includes(undefined)) {
      stated.push(new Set(shapes as JsonShape[]));
    }
  };
  // zod writes z.never() as { not: {} }, which no value matches.
  const not = record.not;
  if (
    typeof not === "object" &&
    not !== null &&
    Object.keys(not).length === 0
  ) {
    stated.push(new Set());
  }
  if (typeof type === "string" || Array.isArray(type)) {
    statedValues([type].flat().map((name) => shapeOfJsonType[String(name)]));
  }
  if (Array.isArray(record.enum)) statedValues(record.enum.map(shapeOfValue));
  if ("const" in record) statedValues([shapeOfValue(record.const)]);
  const ref = record.$ref;
  if (typeof ref === "string" && ref.startsWith("#/$defs/")) {
    const defs = root.$defs as Record<string, unknown> | undefined;
    // A JSON Pointer token escapes "~" as "~0" and "/" as "~1".
    const name = ref
      .slice("#/$defs/".length)
      .replaceAll("~1", "/")
      .replaceAll("~0", "~");
    const shapes = jsonShapes(defs?.[name], root, inner);
    if (shapes) stated.push(shapes);
  }
  const branches = anyOf ?? oneOf;
  if (Array.isArray(branches)) {
    const shapes = branches.map((branch) => jsonShapes(branch, root, inner));
    if (!shapes.includes(undefined)) {
      stated.push(new Set(shapes.flatMap((set) => [...(set ?? [])])));
    }
  }
  if (Array.isArray(allOf)) {
    for (const member of allOf) {
      const shapes = jsonShapes(member, root, inner);
      if (shapes) stated.push(shapes);
    }
  }
  if (stated.length === 0) return undefined;
  const [first, ...rest] = stated;
  return new Set(
    [...first].filter((shape) => rest.every((set) => set.has(shape))),
  );
}

/**
 * The representation zod states for every output value of `schema`, or
 * `undefined` when it cannot state one. One shape is that representation;
 * several are `json`.
 */
export function statedRepresentation(
  schema: z.ZodType,
): JsonRepresentation | undefined {
  const jsonSchema = outputJsonSchema(schema);
  const stated = jsonShapes(jsonSchema, jsonSchema);
  if (stated === undefined) return undefined;
  const shapes = [...stated].filter((shape) => shape !== "null");
  if (shapes.length === 0) return undefined;
  const [only, ...rest] = shapes;
  return rest.length === 0 ? only : "json";
}

function outputJsonSchema(schema: z.ZodType): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema, { io: "output", unrepresentable: "any" });
  } catch {
    return {};
  }
}
