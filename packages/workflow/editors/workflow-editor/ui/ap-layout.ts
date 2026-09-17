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

export function portRank(port: string): number {
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
  const stepById = new Map(model.steps.map((step) => [step.id, step]));

  const branchPorts = (id: string): string[] =>
    stepById.get(id)?.blockType === "core#branch" ? ["true", "false"] : [];

  // An unwired branch port still occupies a column: it gets a placeholder card
  // where its step would go, so both branches read as branches.
  const outletsOf = (
    id: string,
    used: (target: string) => boolean,
  ): { port: string; edge?: EdgeModel }[] => {
    const edges = (outgoing.get(id) ?? []).filter((edge) => !used(edge.to));
    const ports = branchPorts(id);
    if (ports.length === 0) {
      return edges.map((edge) => ({ port: edge.port, edge }));
    }
    const wired = new Set(edges.map((edge) => edge.port));
    return [
      ...edges.map((edge) => ({ port: edge.port, edge })),
      ...ports.filter((port) => !wired.has(port)).map((port) => ({ port })),
    ].sort((a, b) => portRank(a.port) - portRank(b.port));
  };

  const subtreeWidth = (id: string, visited: Set<string>): number => {
    if (visited.has(id)) return STEP_WIDTH;
    visited.add(id);
    const outlets = outletsOf(id, (target) => visited.has(target));
    if (outlets.length === 0) return STEP_WIDTH;
    const total = outlets
      .map((outlet) =>
        outlet.edge ? subtreeWidth(outlet.edge.to, visited) : STEP_WIDTH,
      )
      .reduce((sum, width) => sum + width, 0);
    return Math.max(STEP_WIDTH, total + (outlets.length - 1) * HSPACE);
  };

  // Centre of the column reserved for an unwired port, keyed "stepId:port".
  const placeholders = new Map<string, { x: number; y: number }>();

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

    const outlets = outletsOf(id, (target) => placed.has(target));
    const widths = outlets.map((outlet) =>
      outlet.edge ? subtreeWidth(outlet.edge.to, new Set(placed)) : STEP_WIDTH,
    );
    const total =
      widths.reduce((sum, width) => sum + width, 0) +
      Math.max(outlets.length - 1, 0) * HSPACE;
    const childY = y + STEP_HEIGHT + VSPACE;
    let cursor = centerX - total / 2;
    outlets.forEach((outlet, index) => {
      const slotCenter = cursor + widths[index] / 2;
      if (outlet.edge) {
        place(outlet.edge.to, slotCenter, childY);
      } else {
        placeholders.set(`${id}:${outlet.port}`, { x: slotCenter, y: childY });
      }
      cursor += widths[index] + HSPACE;
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
  const candidatePorts = (id: string): string[] => {
    if (id === model.trigger?.id) return ["next"];
    const step = stepById.get(id);
    if (!step) return [];
    return step.blockType === "core#branch" ? ["true", "false"] : ["next"];
  };

  const appendPorts = (id: string): string[] => {
    const used = new Set((outgoing.get(id) ?? []).map((edge) => edge.port));
    return candidatePorts(id).filter((port) => !used.has(port));
  };

  for (const node of [...nodes]) {
    if (node.type !== "apStep") continue;
    appendPorts(node.id).forEach((port) => {
      const slot = placeholders.get(`${node.id}:${port}`);
      const buttonId = `__append:${node.id}:${port}`;
      nodes.push({
        id: buttonId,
        type: "apAppend",
        position: slot
          ? { x: slot.x - STEP_WIDTH / 2, y: slot.y }
          : {
              x: node.position.x + STEP_WIDTH / 2 - ADD_BUTTON_SIZE / 2,
              y:
                node.position.y +
                STEP_HEIGHT +
                VSPACE / 2 -
                ADD_BUTTON_SIZE / 2,
            },
        data: { parentId: node.id, port, card: Boolean(slot) },
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
