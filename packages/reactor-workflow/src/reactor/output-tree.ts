// Authored output shapes for the {} expression picker: document-model SDL,
// piece outputSchema/sampleData, and static shapes for core blocks.
import {
  DOCUMENT_REF_KEY,
  isDocumentRefMarker,
  type DocumentReference,
} from "@powerhousedao/pieces-framework/workflow";
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
  // "test": the block's latest test output, the picker's "from test" source.
  source: "schema" | "sample" | "static" | "none" | "test";
  nodes: OutputTreeNode[];
  // "test" only: the output itself, and when and in which run it was taken.
  sample?: unknown;
  testedAt?: string;
  runId?: string;
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

// The type a spec names for its root: `<Model>State` for the global state
// (`<Model>GlobalState` also valid), `<Operation>Input` for an operation.
export type SdlRoot = { state: string } | { input: string };

// Case- and separator-insensitive, so SET_URL matches SetUrlInput and SetURLInput.
const normalize = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, "");

function rootCandidates(root: SdlRoot): string[] {
  if ("input" in root) return [`${normalize(root.input)}input`];
  const model = normalize(root.state);
  return [`${model}state`, `${model}globalstate`];
}

// Field tree of the spec's root type (object or input), recursing into types
// defined in the same SDL; unknown/scalar types are leaves.
export function fieldsFromSdl(sdl: string, root: SdlRoot): OutputTreeNode[] {
  let definitions;
  try {
    definitions = parse(sdl).definitions;
  } catch {
    return [];
  }
  const types = new Map<string, readonly FieldNode[]>();
  const byNormalized = new Map<string, string>();
  for (const def of definitions) {
    if (
      def.kind !== Kind.OBJECT_TYPE_DEFINITION &&
      def.kind !== Kind.INPUT_OBJECT_TYPE_DEFINITION
    ) {
      continue;
    }
    const name = def.name.value;
    types.set(name, def.fields ?? []);
    if (!byNormalized.has(normalize(name))) {
      byNormalized.set(normalize(name), name);
    }
  }
  const rootName = rootCandidates(root)
    .map((candidate) => byNormalized.get(candidate))
    .find((name) => name !== undefined);
  if (!rootName) return [];

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
  return build(rootName, 0);
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
// A journaled document reference becomes the nodes `documentNodes` gives.
export function fromSample(
  value: unknown,
  depth = 0,
  documentNodes?: (reference: DocumentReference) => OutputTreeNode[],
): OutputTreeNode[] {
  if (value === null || typeof value !== "object" || depth > MAX_DEPTH) {
    return [];
  }
  const marker =
    documentNodes && isDocumentRefMarker(value)
      ? value[DOCUMENT_REF_KEY]
      : undefined;
  const entries = Array.isArray(value)
    ? value.slice(0, 1).map((item) => ["0", item] as const)
    : Object.entries(value as Record<string, unknown>).filter(
        ([name]) => !marker || name !== DOCUMENT_REF_KEY,
      );
  const nodes = entries.map(([name, child]) => {
    const kind = Array.isArray(child)
      ? "array"
      : child === null
        ? "null"
        : typeof child;
    const children = fromSample(child, depth + 1, documentNodes);
    return {
      name,
      type: kind,
      ...(children.length > 0 ? { children } : {}),
    };
  });
  return marker && documentNodes ? [...documentNodes(marker), ...nodes] : nodes;
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

// A reactor document's header, as document-get and document-find return it.
export function documentHeaderNode(): OutputTreeNode {
  return {
    name: "header",
    type: "object",
    children: [
      leaf("id", "PHID!"),
      leaf("documentType", "String!"),
      leaf("name", "String"),
      leaf("slug", "String"),
      leaf("branch", "String!"),
      leaf("revision", "JSONObject!", "Operation count per scope"),
      leaf("createdAtUtcIso", "DateTime!"),
      leaf("lastModifiedAtUtcIso", "DateTime!"),
    ],
  };
}

// { header, state }; global state children come from the model's schema.
export function documentTree(
  globalChildren: OutputTreeNode[],
): OutputTreeNode[] {
  return [
    documentHeaderNode(),
    {
      name: "state",
      type: "object",
      children: [
        {
          name: "global",
          type: "object",
          description: "Document global state as read",
          ...(globalChildren.length > 0 ? { children: globalChildren } : {}),
        },
      ],
    },
  ];
}

// What document-create and document-dispatch output.
export function documentReferenceTree(): OutputTreeNode[] {
  return [
    leaf("documentId", "PHID!"),
    leaf("documentType", "String!"),
    leaf("branch", "String!"),
    leaf(
      "revision",
      "JSONObject!",
      "Operation count per scope after the write",
    ),
  ];
}

export function documentFindTree(): OutputTreeNode[] {
  return [
    {
      name: "results",
      type: "array",
      children: [
        documentHeaderNode(),
        leaf("state", "JSONObject", "With Include state only"),
      ],
    },
    leaf("nextCursor", "String", "Present while more documents match"),
  ];
}

// An output tree as a value, its leaves the declared type names.
export function treeValue(nodes: OutputTreeNode[]): Record<string, unknown> {
  return Object.fromEntries(
    nodes.map((node) => [
      node.name,
      node.children ? treeValue(node.children) : node.type,
    ]),
  );
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
    leaf("name", "String", "Set on creation only"),
    leaf("driveId", "PHID", "Null for a document that belongs to no drive"),
    leaf("parentId", "PHID"),
    OPERATION_NODE,
  ];
}

// The core schedule trigger's payload; exactly one of cron / everyMs is present.
export function scheduleTriggerTree(): OutputTreeNode[] {
  return [
    leaf("scheduledFor", "DateTime!", "The slot that came due (ISO 8601)"),
    leaf("firedAt", "DateTime!", "When the run actually started"),
    leaf("timezone", "String!"),
    leaf("cron", "String", "Cron mode only"),
    leaf("everyMs", "Int", "Interval mode only"),
  ];
}

// The core webhook trigger's payload: Activepieces' catch-webhook shape. Headers and query
// are open maps, so they stay leaves the author addresses by name.
export function webhookTriggerTree(): OutputTreeNode[] {
  return [
    leaf("method", "String!", "Uppercase HTTP method"),
    leaf("path", "String!"),
    leaf("headers", "JSONObject!", "Lowercased names; credentials redacted"),
    leaf("queryParams", "JSONObject!"),
    leaf("body", "Unknown", "Parsed JSON or form fields; text otherwise"),
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
