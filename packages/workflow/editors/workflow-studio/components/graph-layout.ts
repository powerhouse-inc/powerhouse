// Places a workflow on a grid for the horizontal overview graph: columns by
// depth from the trigger, lanes so branches fan out below their source.
import {
  stepOutline,
  type OutlineEdge,
  type OutlineStep,
} from "./step-outline.js";

export const TRIGGER_NODE = "trigger";

export interface GraphNode {
  step: OutlineStep;
  // 1 is the first column after the trigger.
  col: number;
  lane: number;
  // The port it runs on; null for "next", entries and joins.
  port: string | null;
}

export interface GraphEdge {
  // A step id, or TRIGGER_NODE.
  from: string;
  to: string;
  port: string;
  // The lane its horizontal run follows between columns; `under` runs it in
  // the gutter below that lane when steps sit on both ends' lanes.
  track: { lane: number; under: boolean };
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  cols: number;
  lanes: number;
}

// Ports that leave the main line and drop to a lower lane.
const SIDE_PORTS = new Set(["false", "error"]);

export function graphLayout(args: {
  triggerId?: string | null;
  steps: readonly OutlineStep[];
  edges: readonly OutlineEdge[];
}): GraphLayout {
  const { rows } = stepOutline(args);
  const nodeId = (id: string) => (id === args.triggerId ? TRIGGER_NODE : id);
  const placed = new Map<string, { col: number; lane: number }>([
    [TRIGGER_NODE, { col: 0, lane: 0 }],
  ]);
  const taken = new Set<string>();
  const inbound = new Map<string, OutlineEdge[]>();
  const outbound = new Map<string, number>();
  for (const edge of args.edges) {
    const list = inbound.get(edge.to) ?? [];
    list.push(edge);
    inbound.set(edge.to, list);
    outbound.set(edge.from, (outbound.get(edge.from) ?? 0) + 1);
  }
  // A side port drops a lane only to clear the way for its source's other
  // path; a step's only way out stays on its lane.
  const drops = (edge: OutlineEdge) =>
    SIDE_PORTS.has(edge.port) && (outbound.get(edge.from) ?? 0) > 1;

  const nodes: GraphNode[] = [];
  for (const { step } of rows) {
    const from = (inbound.get(step.id) ?? []).filter((edge) =>
      placed.has(nodeId(edge.from)),
    );
    const col = Math.max(
      1,
      ...from.map((edge) => placed.get(nodeId(edge.from))!.col + 1),
    );
    // A join stays on the highest lane any of its sources leads to.
    let lane = Math.min(
      ...from.map(
        (edge) => placed.get(nodeId(edge.from))!.lane + (drops(edge) ? 1 : 0),
      ),
      from.length === 0 ? 0 : Infinity,
    );
    const port =
      from.length === 1 && from[0].port !== "next" ? from[0].port : null;
    while (taken.has(`${col}:${lane}`)) lane++;
    taken.add(`${col}:${lane}`);
    placed.set(step.id, { col, lane });
    nodes.push({ step, col, lane, port });
  }

  const edges = args.edges
    .map((edge) => ({ ...edge, from: nodeId(edge.from) }))
    .filter((edge) => placed.has(edge.from) && placed.has(edge.to))
    .map((edge): GraphEdge => {
      const a = placed.get(edge.from)!;
      const b = placed.get(edge.to)!;
      const clear = (lane: number) =>
        !nodes.some(
          (node) => node.lane === lane && node.col > a.col && node.col < b.col,
        );
      // The lower lane first: a branch drops early, a join rises late.
      const low = Math.max(a.lane, b.lane);
      const high = Math.min(a.lane, b.lane);
      const track = clear(low)
        ? { lane: low, under: false }
        : clear(high)
          ? { lane: high, under: false }
          : { lane: high, under: true };
      return { from: edge.from, to: edge.to, port: edge.port, track };
    });
  return {
    nodes,
    edges,
    cols: Math.max(0, ...nodes.map((node) => node.col)),
    lanes: Math.max(1, ...nodes.map((node) => node.lane + 1)),
  };
}
