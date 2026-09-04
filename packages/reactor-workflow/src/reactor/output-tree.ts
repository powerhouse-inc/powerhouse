// Authored output shapes for the {} expression picker: document-model SDL,
// piece outputSchema/sampleData, and static shapes for core blocks.
import {
  Kind,
  parse,
  type FieldDefinitionNode,
  type InputValueDefinitionNode,
  type TypeNode,
} from "graphql";

export interface OutputTreeNode {
  name: string;
  // Display type, e.g. "String!", "OID", "array", "string (sample)".
  type: string;
  description?: string;
  children?: OutputTreeNode[];
}

export interface OutputTree {
  source: "schema" | "sample" | "static" | "none";
  nodes: OutputTreeNode[];
}

const MAX_DEPTH = 6;

function typeName(node: TypeNode): { name: string; display: string } {
  switch (node.kind) {
    case Kind.NON_NULL_TYPE: {
      const inner = typeName(node.type);
      return { name: inner.name, display: `${inner.display}!` };
    }
    case Kind.LIST_TYPE: {
      const inner = typeName(node.type);
      return { name: inner.name, display: `[${inner.display}]` };
    }
    default:
      return { name: node.name.value, display: node.name.value };
  }
}

type FieldNode = FieldDefinitionNode | InputValueDefinitionNode;

// Field tree of `rootType` (object or input), recursing into types defined in
// the same SDL; unknown/scalar types are leaves labeled by their display name.
export function fieldsFromSdl(
  sdl: string,
  rootType?: string,
): OutputTreeNode[] {
  let definitions;
  try {
    definitions = parse(sdl).definitions;
  } catch {
    return [];
  }
  const types = new Map<string, readonly FieldNode[]>();
  let firstType: string | undefined;
  let stateType: string | undefined;
  for (const def of definitions) {
    if (
      def.kind !== Kind.OBJECT_TYPE_DEFINITION &&
      def.kind !== Kind.INPUT_OBJECT_TYPE_DEFINITION
    ) {
      continue;
    }
    const name = def.name.value;
    types.set(name, def.fields ?? []);
    firstType ??= name;
    if (name.endsWith("State") && !name.endsWith("LocalState")) {
      stateType ??= name;
    }
  }
  const root = rootType ?? stateType ?? firstType;
  if (!root) return [];

  const build = (name: string, depth: number): OutputTreeNode[] => {
    const fields = types.get(name);
    if (!fields || depth > MAX_DEPTH) return [];
    return fields.map((field) => {
      const { name: inner, display } = typeName(field.type);
      const children = build(inner, depth + 1);
      return {
        name: field.name.value,
        type: display,
        description: field.description?.value,
        ...(children.length > 0 ? { children } : {}),
      };
    });
  };
  return build(root, 0);
}

interface ApOutputSchemaField {
  key?: string;
  label?: string;
  // Path into run()'s return value; defaults to key, "" means the whole output.
  value?: string;
  format?: string;
  description?: string;
  children?: ApOutputSchemaField[];
  properties?: ApOutputSchemaField[];
  listItems?: ApOutputSchemaField[];
}

// Nodes from separate fields can share a path prefix (a.b + a.c): merge them.
function mergeNodes(nodes: OutputTreeNode[]): OutputTreeNode[] {
  const byName = new Map<string, OutputTreeNode>();
  for (const node of nodes) {
    const existing = byName.get(node.name);
    if (existing?.children && node.children) {
      existing.children = mergeNodes([...existing.children, ...node.children]);
    } else if (!byName.has(node.name)) {
      byName.set(node.name, node);
    }
  }
  return [...byName.values()];
}

// Activepieces action/trigger outputSchema → tree. Expression paths follow
// each field's `value` (the real path into run()'s return), not its key.
export function fromOutputSchema(schema: unknown): OutputTreeNode[] {
  const fields = (schema as { fields?: ApOutputSchemaField[] } | null)?.fields;
  if (!Array.isArray(fields)) return [];
  const convert = (field: ApOutputSchemaField): OutputTreeNode[] => {
    const inner = field.children ?? field.properties;
    const items = field.listItems;
    const childNodes = mergeNodes((inner ?? items ?? []).flatMap(convert));
    const path =
      typeof field.value === "string" ? field.value : (field.key ?? "");
    // Whole-output field: hoist children; a scalar contributes no sub-path.
    if (path === "") return childNodes;
    const segments = path.split(".");
    let node: OutputTreeNode = {
      name: segments[segments.length - 1],
      type: items
        ? "array"
        : (field.format ?? (childNodes.length > 0 ? "object" : "value")),
      description: field.description,
      ...(childNodes.length > 0 ? { children: childNodes } : {}),
    };
    for (let i = segments.length - 2; i >= 0; i--) {
      node = { name: segments[i], type: "object", children: [node] };
    }
    return [node];
  };
  return mergeNodes(fields.flatMap(convert)).filter((node) => node.name);
}

export function hasOutputSchemaFields(schema: unknown): boolean {
  const fields = (schema as { fields?: unknown[] } | null)?.fields;
  return Array.isArray(fields) && fields.length > 0;
}

// Piece-authored sampleData → tree; types inferred from the sample's values.
export function fromSample(value: unknown, depth = 0): OutputTreeNode[] {
  if (value === null || typeof value !== "object" || depth > MAX_DEPTH) {
    return [];
  }
  const entries = Array.isArray(value)
    ? value.slice(0, 1).map((item) => ["0", item] as const)
    : Object.entries(value as Record<string, unknown>);
  return entries.map(([name, child]) => {
    const kind = Array.isArray(child)
      ? "array"
      : child === null
        ? "null"
        : typeof child;
    const children = fromSample(child, depth + 1);
    return {
      name,
      type: kind,
      ...(children.length > 0 ? { children } : {}),
    };
  });
}

const leaf = (name: string, type: string, description?: string) => ({
  name,
  type,
  ...(description ? { description } : {}),
});

export const OPERATION_NODE: OutputTreeNode = {
  name: "operation",
  type: "object",
  children: [leaf("index", "Int!"), leaf("timestampUtcMs", "String!")],
};

// Envelope both document blocks return; state children come from the model.
export function documentBlockTree(
  stateChildren: OutputTreeNode[],
): OutputTreeNode[] {
  return [
    leaf("documentId", "PHID!"),
    leaf("documentType", "String!"),
    leaf("name", "String"),
    {
      name: "state",
      type: "object",
      description: "Document global state after the actions applied",
      ...(stateChildren.length > 0 ? { children: stateChildren } : {}),
    },
  ];
}

export function documentGetTree(
  stateChildren: OutputTreeNode[],
): OutputTreeNode[] {
  return [
    ...documentBlockTree(stateChildren).filter((node) => node.name !== "state"),
    leaf("slug", "String"),
    {
      name: "state",
      type: "object",
      description: "Document global state as read",
      ...(stateChildren.length > 0 ? { children: stateChildren } : {}),
    },
  ];
}

export function documentFindTree(): OutputTreeNode[] {
  return [
    leaf("count", "Int!"),
    {
      name: "documents",
      type: "array",
      children: [
        leaf("documentId", "PHID!"),
        leaf("documentType", "String!"),
        leaf("name", "String"),
        leaf("slug", "String"),
      ],
    },
  ];
}

export function documentTypesTree(): OutputTreeNode[] {
  return [
    leaf("count", "Int!"),
    {
      name: "types",
      type: "array",
      children: [leaf("documentType", "String!"), leaf("name", "String")],
    },
  ];
}

export function documentSchemaTree(): OutputTreeNode[] {
  return [
    leaf("documentType", "String!"),
    leaf("name", "String"),
    leaf("stateSchema", "String", "SDL of the global state type"),
    {
      name: "actions",
      type: "array",
      description: "Dispatchable actions with their input SDL",
      children: [
        leaf("type", "String!"),
        leaf("module", "String"),
        leaf("inputSchema", "String"),
      ],
    },
  ];
}

export function lifecycleTriggerTree(): OutputTreeNode[] {
  return [
    leaf("documentId", "PHID!"),
    leaf("documentType", "String"),
    leaf("name", "String"),
    leaf("driveId", "PHID!"),
    leaf("parentId", "PHID"),
    OPERATION_NODE,
  ];
}

// core#schedule payload; exactly one of cron / everyMs is present.
export function scheduleTriggerTree(): OutputTreeNode[] {
  return [
    leaf("scheduledFor", "DateTime!", "The slot that came due (ISO 8601)"),
    leaf("firedAt", "DateTime!", "When the run actually started"),
    leaf("timezone", "String!"),
    leaf("cron", "String", "Cron mode only"),
    leaf("everyMs", "Int", "Interval mode only"),
  ];
}

export function documentEventTree(
  actionInputChildren: OutputTreeNode[],
): OutputTreeNode[] {
  return [
    leaf("documentId", "PHID!"),
    leaf("documentType", "String!"),
    leaf("branch", "String!"),
    leaf("scope", "String!"),
    {
      name: "action",
      type: "object",
      children: [
        leaf("type", "String!"),
        {
          name: "input",
          type: "object",
          ...(actionInputChildren.length > 0
            ? { children: actionInputChildren }
            : {}),
        },
      ],
    },
    OPERATION_NODE,
  ];
}
