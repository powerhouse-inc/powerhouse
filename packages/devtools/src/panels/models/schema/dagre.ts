import * as dagre from "@dagrejs/dagre";

/**
 * The part of a dagre graph the schema layout uses. dagre's published types
 * import their own files without extensions, which NodeNext resolution cannot
 * follow, so TypeScript sees `Graph` and `layout` as untyped. These types
 * stand in for them.
 */
export interface LayoutGraph {
  setDefaultEdgeLabel(label: () => object): LayoutGraph;
  setGraph(label: {
    rankdir: "LR" | "RL" | "TB" | "BT";
    ranksep: number;
    nodesep: number;
    marginx: number;
    marginy: number;
    ranker: "network-simplex" | "tight-tree" | "longest-path";
  }): LayoutGraph;
  setNode(id: string, label: { width: number; height: number }): LayoutGraph;
  setEdge(source: string, target: string): LayoutGraph;
  /** A node's centre, once `layout` has run. */
  node(id: string): { x: number; y: number };
}

export const createLayoutGraph = (): LayoutGraph =>
  new (dagre.Graph as unknown as new () => LayoutGraph)();

export const layout = dagre.layout as unknown as (graph: LayoutGraph) => void;
