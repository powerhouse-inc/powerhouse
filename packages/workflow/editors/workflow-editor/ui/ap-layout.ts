// Vertical tree layout, a port of the Activepieces builder flow-canvas
// layout behavior (MIT, activepieces packages/web) onto our flat graph.
import type { Edge, Node } from "@xyflow/react";
import type { EdgeModel, StepModel, WorkflowModel } from "./model.js";

export function reachableFrom(start: string, edges: EdgeModel[]): Set<string> {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  }
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    for (const next of outgoing.get(queue.pop()!) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

// Steps an edge from `fromId` may target without creating a cycle.
export function acyclicTargets(
  model: WorkflowModel,
  fromId: string,
): StepModel[] {
  return model.steps.filter(
    (step) =>
      step.id !== fromId && !reachableFrom(step.id, model.edges).has(fromId),
  );
}

// Steps a new edge from `fromId` may target: unreachable from the trigger,
// not `fromId` itself, and not an ancestor of it (no cycles).
export function attachableSteps(
  model: WorkflowModel,
  fromId: string,
): StepModel[] {
  if (!model.trigger) return [];
  const attached = reachableFrom(model.trigger.id, model.edges);
  return model.steps.filter(
    (step) =>
      !attached.has(step.id) &&
      step.id !== fromId &&
      !reachableFrom(step.id, model.edges).has(fromId),
  );
}

export const STEP_WIDTH = 232;
export const STEP_HEIGHT = 60;
export const VSPACE = 60;
export const HSPACE = 80;
export const ADD_BUTTON_SIZE = 20;
export const BIG_ADD_BUTTON_SIZE = 50;

const PORT_ORDER = ["next", "true", "false", "error"];

function portRank(port: string): number {
  const index = PORT_ORDER.indexOf(port);
  return index === -1 ? PORT_ORDER.length : index;
}

export interface ApLayout {
  nodes: Node[];
  edges: Edge[];
}

// Builds react-flow nodes/edges: steps laid out as a centered vertical tree,
// append buttons under leaves, and one add button per edge.
export function layoutWorkflow(model: WorkflowModel): ApLayout {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (!model.trigger) {
    nodes.push({
      id: "__big-add",
      type: "apBigButton",
      position: { x: -BIG_ADD_BUTTON_SIZE / 2, y: 0 },
      data: {},
      draggable: false,
      selectable: false,
    });
    return { nodes, edges };
  }

  const stepIds = new Set(model.steps.map((step) => step.id));
  const outgoing = new Map<string, EdgeModel[]>();
  for (const edge of model.edges) {
    if (!stepIds.has(edge.to)) continue;
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
  }
  for (const list of outgoing.values()) {
    list.sort((a, b) => portRank(a.port) - portRank(b.port));
  }

  const placed = new Set<string>();

  const subtreeWidth = (id: string, visited: Set<string>): number => {
    if (visited.has(id)) return STEP_WIDTH;
    visited.add(id);
    const children = (outgoing.get(id) ?? []).filter(
      (edge) => !visited.has(edge.to),
    );
    if (children.length === 0) return STEP_WIDTH;
    const total = children
      .map((edge) => subtreeWidth(edge.to, visited))
      .reduce((sum, width) => sum + width, 0);
    return Math.max(STEP_WIDTH, total + (children.length - 1) * HSPACE);
  };

  const stepById = new Map(model.steps.map((step) => [step.id, step]));

  const place = (id: string, centerX: number, y: number) => {
    if (placed.has(id)) return;
    placed.add(id);
    const step = stepById.get(id);
    const isTrigger = id === model.trigger?.id;
    nodes.push({
      id,
      type: "apStep",
      position: { x: centerX - STEP_WIDTH / 2, y },
      data: isTrigger
        ? { kind: "trigger", trigger: model.trigger }
        : { kind: "step", step },
      draggable: false,
    });

    const children = (outgoing.get(id) ?? []).filter(
      (edge) => !placed.has(edge.to),
    );
    const widths = children.map((edge) =>
      subtreeWidth(edge.to, new Set(placed)),
    );
    const total =
      widths.reduce((sum, width) => sum + width, 0) +
      Math.max(children.length - 1, 0) * HSPACE;
    let cursor = centerX - total / 2;
    children.forEach((edge, index) => {
      const width = widths[index];
      place(edge.to, cursor + width / 2, y + STEP_HEIGHT + VSPACE);
      cursor += width + HSPACE;
    });
  };

  place(model.trigger.id, 0, 0);

  // Steps unreachable from the trigger stack in a column to the right.
  let orphanY = 0;
  const mainWidth = subtreeWidth(model.trigger.id, new Set());
  for (const step of model.steps) {
    if (placed.has(step.id)) continue;
    place(step.id, mainWidth / 2 + HSPACE + STEP_WIDTH / 2, orphanY);
    orphanY += STEP_HEIGHT + VSPACE;
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (const edge of model.edges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) continue;
    edges.push({
      id: edge.id,
      type: "apEdge",
      source: edge.from,
      target: edge.to,
      data: { edgeId: edge.id, port: edge.port, condition: edge.condition },
      selectable: true,
    });
  }

  // Append buttons under every step with no outgoing edges (branches get
  // one per untaken port).
  const appendPorts = (id: string): string[] => {
    if (id === model.trigger?.id) {
      return (outgoing.get(id) ?? []).length === 0 ? ["next"] : [];
    }
    const step = stepById.get(id);
    if (!step) return [];
    const used = new Set((outgoing.get(id) ?? []).map((edge) => edge.port));
    const candidates =
      step.blockType === "core#branch" ? ["true", "false"] : ["next"];
    return candidates.filter((port) => !used.has(port));
  };

  for (const node of [...nodes]) {
    if (node.type !== "apStep") continue;
    const ports = appendPorts(node.id);
    ports.forEach((port, index) => {
      const total = ports.length;
      const offset =
        (index - (total - 1) / 2) * (STEP_WIDTH / 2 + HSPACE / 2) * 1.2;
      const buttonId = `__append:${node.id}:${port}`;
      nodes.push({
        id: buttonId,
        type: "apAppend",
        position: {
          x: node.position.x + STEP_WIDTH / 2 - ADD_BUTTON_SIZE / 2 + offset,
          y: node.position.y + STEP_HEIGHT + VSPACE / 2 - ADD_BUTTON_SIZE / 2,
        },
        data: { parentId: node.id, port },
        draggable: false,
        selectable: false,
      });
      edges.push({
        id: `${buttonId}:line`,
        type: "apLink",
        source: node.id,
        target: buttonId,
        data: { port },
        selectable: false,
      });
    });
  }

  return { nodes, edges };
}
