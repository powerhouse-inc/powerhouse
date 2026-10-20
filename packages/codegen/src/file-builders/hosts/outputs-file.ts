import type { HostOutputsDescription } from "@powerhousedao/host-core";

/**
 * Generated `hosts/<name>/outputs.js` + `outputs.d.ts` (typed-host-configs
 * 3.2), a pure function of the producer's {@link HostOutputsDescription}.
 * Leaves are `$output` tokens branded `OutputToken<T>`. Record outputs get
 * one key per known key (top-level `drives`: the declared slugs) plus an
 * `$item` tree (`ItemToken<T>` leaves, for `$map` templates); arrays get only
 * the `$item` tree. `outputsHash` is what the loader's staleness gate checks.
 */

type JsonSchema = Record<string, unknown>;

/** The record output whose known keys are the producer's declared drives. */
const DRIVES_OUTPUT = "drives";
const ITEM_KEY = "$item";

interface TreeNode {
  /** JS value: a token, or a nested object of nodes. */
  value: unknown;
  /** TS type text for the .d.ts. */
  type: string;
}

interface BuildContext {
  root: JsonSchema;
  host: string;
  drives: readonly string[];
}

function isSchema(value: unknown): value is JsonSchema {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Follows a local `#/$defs/<name>` (or `#/definitions/<name>`) reference. */
function deref(schema: JsonSchema, root: JsonSchema): JsonSchema {
  const ref = schema.$ref;
  if (typeof ref !== "string") return schema;
  const match = /^#\/(\$defs|definitions)\/(.+)$/.exec(ref);
  const defs = match ? root[match[1]] : undefined;
  const target = isSchema(defs) && match ? defs[match[2]] : undefined;
  return isSchema(target) ? deref(target, root) : {};
}

function properties(schema: JsonSchema): Record<string, JsonSchema> {
  const props = schema.properties;
  if (!isSchema(props)) return {};
  return Object.fromEntries(
    Object.entries(props).filter((entry): entry is [string, JsonSchema] =>
      isSchema(entry[1]),
    ),
  );
}

function required(schema: JsonSchema): Set<string> {
  return new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === "string")
      : [],
  );
}

type Shape =
  | { kind: "object"; props: Record<string, JsonSchema>; required: Set<string> }
  | { kind: "record"; value: JsonSchema }
  | { kind: "array"; items: JsonSchema }
  | { kind: "leaf" };

function shapeOf(schema: JsonSchema): Shape {
  if (schema.type === "array" && isSchema(schema.items)) {
    return { kind: "array", items: schema.items };
  }
  if (schema.type === "object") {
    const props = properties(schema);
    if (Object.keys(props).length > 0) {
      return { kind: "object", props, required: required(schema) };
    }
    if (isSchema(schema.additionalProperties)) {
      return { kind: "record", value: schema.additionalProperties };
    }
  }
  return { kind: "leaf" };
}

const quote = (key: string) => JSON.stringify(key);

/** The TS type of an output value described by `schema`. */
export function tsTypeOfSchema(input: JsonSchema, root: JsonSchema): string {
  const schema = deref(input, root);
  if ("const" in schema) return JSON.stringify(schema.const);
  if (Array.isArray(schema.enum)) {
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  }
  const union = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(union)) {
    const members = union
      .filter(isSchema)
      .map((member) => tsTypeOfSchema(member, root));
    return members.length > 0 ? [...new Set(members)].join(" | ") : "unknown";
  }
  if (Array.isArray(schema.type)) {
    return schema.type
      .map((type) => tsTypeOfSchema({ ...schema, type }, root))
      .join(" | ");
  }
  switch (schema.type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
  }
  const shape = shapeOf(schema);
  switch (shape.kind) {
    case "array":
      return `${wrap(tsTypeOfSchema(shape.items, root))}[]`;
    case "record":
      return `Record<string, ${tsTypeOfSchema(shape.value, root)}>`;
    case "object":
      return `{ ${Object.entries(shape.props)
        .map(
          ([key, child]) =>
            `${quote(key)}${shape.required.has(key) ? "" : "?"}: ${tsTypeOfSchema(child, root)}`,
        )
        .join("; ")} }`;
    case "leaf":
      return schema.type === "object" ? "Record<string, unknown>" : "unknown";
  }
}

function wrap(type: string): string {
  return /[|&]/.test(type) ? `(${type})` : type;
}

function objectNode(entries: [string, TreeNode][]): TreeNode {
  return {
    value: Object.fromEntries(entries.map(([key, node]) => [key, node.value])),
    type: `{ ${entries.map(([key, node]) => `${quote(key)}: ${node.type}`).join("; ")} }`,
  };
}

/** `$item` tree for one collection element: leaves are `{ $item: path }`
 * relative to the element. A nested collection is one leaf (usable as a
 * nested `$map` `over`). */
function itemTree(
  input: JsonSchema,
  path: (string | number)[],
  optional: boolean,
  context: BuildContext,
): TreeNode {
  const schema = deref(input, context.root);
  const shape = shapeOf(schema);
  if (shape.kind === "object") {
    return objectNode(
      Object.entries(shape.props).map(([key, child]) => [
        key,
        itemTree(
          child,
          [...path, key],
          optional || !shape.required.has(key),
          context,
        ),
      ]),
    );
  }
  const type = tsTypeOfSchema(schema, context.root);
  return {
    value: { $item: path },
    type: `ItemToken<${optional ? `${type} | undefined` : type}>`,
  };
}

function outputTree(
  input: JsonSchema,
  path: (string | number)[],
  optional: boolean,
  context: BuildContext,
): TreeNode {
  const schema = deref(input, context.root);
  const shape = shapeOf(schema);
  switch (shape.kind) {
    case "object":
      return objectNode(
        Object.entries(shape.props).map(([key, child]) => [
          key,
          outputTree(
            child,
            [...path, key],
            optional || !shape.required.has(key),
            context,
          ),
        ]),
      );
    case "record": {
      const keys =
        path.length === 1 && path[0] === DRIVES_OUTPUT ? context.drives : [];
      return objectNode([
        ...keys.map((key): [string, TreeNode] => [
          key,
          outputTree(shape.value, [...path, key], optional, context),
        ]),
        [ITEM_KEY, itemTree(shape.value, [], false, context)],
      ]);
    }
    case "array":
      return objectNode([
        [ITEM_KEY, itemTree(shape.items, [], false, context)],
      ]);
    case "leaf": {
      const type = tsTypeOfSchema(schema, context.root);
      return {
        value: { $output: { host: context.host, path } },
        type: `OutputToken<${optional ? `${type} | undefined` : type}>`,
      };
    }
  }
}

/** The token tree of a producer's outputs (value + TS type). */
export function buildOutputsTree(description: HostOutputsDescription): {
  value: unknown;
  type: string;
} {
  const context: BuildContext = {
    root: description.outputsSchema,
    host: description.host,
    drives: description.drives,
  };
  return outputTree(description.outputsSchema, [], false, context);
}

function header(description: HostOutputsDescription): string {
  return `// GENERATED by \`ph generate hosts\` from the outputsSchema of
// ${description.runnerModule} and the drives hosts/${description.host} declares.
// Do not edit: when either changes, hosts importing this file fail to load
// until it is regenerated (\`ph generate hosts\`).`;
}

/** `hosts/<name>/outputs.js` and `outputs.d.ts`, unformatted. */
export function buildOutputsFiles(description: HostOutputsDescription): {
  js: string;
  dts: string;
} {
  const tree = buildOutputsTree(description);
  const js = `${header(description)}
export const outputsHash = ${JSON.stringify(description.hash)};

export const outputs = ${JSON.stringify(tree.value, null, 2)};
`;
  const dts = `${header(description)}
import type { ItemToken, OutputToken } from "@powerhousedao/host-core/schema";

export declare const outputsHash: ${JSON.stringify(description.hash)};

export declare const outputs: ${tree.type};
`;
  return { js, dts };
}
