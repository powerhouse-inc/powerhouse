import { Graph, layout } from "@dagrejs/dagre";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import {
  SCHEMA_GRAPH_LIMITS,
  type SchemaDeclaration,
  type SchemaDeclarationKind,
  type SchemaGraph,
  type SchemaMember,
} from "./schema-graph.js";

export const WIDTH = 272;
export const HEAD = 42;
export const ROW = 27;
const EMPTY = 34;
const MORE = 29;
export const FIT = { padding: 0.16, maxZoom: 1 };

export const KIND_LABEL: Record<SchemaDeclarationKind, string> = {
  type: "Type",
  interface: "Interface",
  input: "Input",
  enum: "Enum",
  union: "Union",
  scalar: "Scalar",
};

type Row = { member: SchemaMember; index: number; linked: boolean };

export type DeclarationData = {
  declaration: SchemaDeclaration;
  rows: Row[];
  hidden: number;
  hasMoreHandle: boolean;
  hasHeadHandle: boolean;
  expandable: boolean;
  expanded: boolean;
};

export type DeclarationNode = Node<DeclarationData, "declaration">;

function heightOf(data: DeclarationData) {
  if (data.rows.length === 0) return HEAD + EMPTY;
  return HEAD + data.rows.length * ROW + (data.expandable ? MORE : 0);
}

export type Laid = {
  nodes: DeclarationNode[];
  edges: Edge[];
  root: DeclarationNode;
  neighbourhood: Map<string, Set<string>>;
};

export function laidOut(
  graph: SchemaGraph,
  expanded: ReadonlySet<string>,
): Laid {
  const linkedMembers = new Map<string, Set<number>>();
  const implementing = new Set<string>();
  const neighbourhood = new Map<string, Set<string>>(
    graph.declarations.map((d) => [d.name, new Set([d.name])]),
  );
  for (const link of graph.links) {
    if (link.member === "implements") implementing.add(link.source);
    else {
      const set = linkedMembers.get(link.source) ?? new Set<number>();
      set.add(link.member);
      linkedMembers.set(link.source, set);
    }
    neighbourhood.get(link.source)!.add(link.target);
    neighbourhood.get(link.target)!.add(link.source);
  }

  // dagre keeps nodes in a plain object, so a type named `constructor` or
  // `__proto__` would collide with its prototype: it gets index ids instead.
  const dagreId = new Map(graph.declarations.map((d, i) => [d.name, `n${i}`]));
  const dagre = new Graph()
    .setDefaultEdgeLabel(() => ({}))
    .setGraph({
      rankdir: "LR",
      ranksep: 88,
      nodesep: 40,
      marginx: 32,
      marginy: 32,
      ranker: "network-simplex",
    });
  const data = new Map<string, DeclarationData>();
  for (const declaration of graph.declarations) {
    const open = expanded.has(declaration.name);
    const expandable =
      declaration.members.length > SCHEMA_GRAPH_LIMITS.membersShown;
    const count =
      expandable && !open
        ? SCHEMA_GRAPH_LIMITS.membersShown
        : declaration.members.length;
    const linked = linkedMembers.get(declaration.name) ?? new Set<number>();
    const item: DeclarationData = {
      declaration,
      rows: declaration.members.slice(0, count).map((member, index) => ({
        member,
        index,
        linked: linked.has(index),
      })),
      hidden: declaration.members.length - count,
      hasMoreHandle: [...linked].some((index) => index >= count),
      hasHeadHandle: implementing.has(declaration.name),
      expandable,
      expanded: open,
    };
    data.set(declaration.name, item);
    dagre.setNode(dagreId.get(declaration.name)!, {
      width: WIDTH,
      height: heightOf(item),
    });
  }
  for (const link of graph.links) {
    if (link.source !== link.target) {
      dagre.setEdge(dagreId.get(link.source)!, dagreId.get(link.target)!);
    }
  }
  layout(dagre);

  const nodes = graph.declarations.map((declaration): DeclarationNode => {
    const item = data.get(declaration.name)!;
    const height = heightOf(item);
    const centre = dagre.node(dagreId.get(declaration.name)!);
    return {
      id: declaration.name,
      type: "declaration",
      position: { x: centre.x - WIDTH / 2, y: centre.y - height / 2 },
      width: WIDTH,
      height,
      data: item,
      className: "group/node",
      draggable: false,
      selectable: false,
      focusable: true,
      ariaLabel: `${KIND_LABEL[declaration.kind]} ${declaration.name}`,
    };
  });

  const edges = new Map<string, Edge>();
  for (const link of graph.links) {
    const item = data.get(link.source)!;
    const handle =
      link.member === "implements"
        ? "head"
        : link.member < item.rows.length
          ? `m${link.member}`
          : "more";
    const id = `${link.source}:${handle}:${link.target}`;
    if (edges.has(id)) continue;
    edges.set(id, {
      id,
      source: link.source,
      sourceHandle: handle,
      target: link.target,
      targetHandle: "in",
      type: link.source === link.target ? "default" : "smoothstep",
      selectable: false,
      focusable: false,
    });
  }

  const incoming = new Set(
    graph.links.filter((l) => l.source !== l.target).map((l) => l.target),
  );
  const root = nodes.find((node) => !incoming.has(node.id)) ?? nodes[0];
  return { nodes, edges: [...edges.values()], root, neighbourhood };
}

export function styled(edges: Edge[], focus: string | null): Edge[] {
  return edges.map((edge) => {
    const on =
      focus !== null && (edge.source === focus || edge.target === focus);
    const colour = on ? "var(--primary)" : "var(--muted-foreground)";
    return {
      ...edge,
      zIndex: on ? 1 : 0,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 13,
        height: 13,
        color: colour,
      },
      style: {
        stroke: colour,
        strokeWidth: on ? 1.5 : 1.15,
        strokeOpacity: on ? 0.95 : focus ? 0.12 : 0.58,
      },
    };
  });
}

export type Found = {
  declarations: SchemaDeclaration[];
  members: { declaration: SchemaDeclaration; member: SchemaMember }[];
};

const MEMBERS_FOUND = 50;

/** Every declaration for a blank query; otherwise the declarations and
 * members whose name holds it, ignoring case. */
export function matches(graph: SchemaGraph, query: string): Found {
  const q = query.trim().toLowerCase();
  if (!q) return { declarations: graph.declarations, members: [] };
  const found: Found = { declarations: [], members: [] };
  for (const declaration of graph.declarations) {
    if (declaration.name.toLowerCase().includes(q)) {
      found.declarations.push(declaration);
    }
    for (const member of declaration.members) {
      if (found.members.length === MEMBERS_FOUND) break;
      if (member.label.toLowerCase().includes(q)) {
        found.members.push({ declaration, member });
      }
    }
  }
  return found;
}
