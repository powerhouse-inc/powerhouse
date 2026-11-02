// Vertical tree layout, a port of the Activepieces builder flow-canvas
// layout behavior (MIT, activepieces packages/web) onto our flat graph.
import {
  flowPorts,
  stepPortLabel,
  stepPorts,
} from "@powerhousedao/pieces-framework/workflow";
import type { Edge, Node } from "@xyflow/react";
import { graphLayout } from "../../workflow-studio/components/graph-layout.js";
import { stepBlock, triggerBlock, type BlockRef } from "./blocks.js";
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

// A loop's body before what follows it; a router's branches in their order.
const PORT_ORDER = ["each", "next", "true", "false"];

export function portRank(port: string): number {
  const index = PORT_ORDER.indexOf(port);
  if (index !== -1) return index;
  const branch = /^branch_(\d+)$/.exec(port);
  if (branch) return PORT_ORDER.length + 1 - 1 / Number(branch[1]);
  if (port === "otherwise") return PORT_ORDER.length + 1;
  if (port === "error") return PORT_ORDER.length + 2;
  return PORT_ORDER.length + 3;
}

export interface ApLayout {
  nodes: Node[];
  edges: Edge[];
}

// Builds react-flow nodes/edges: steps laid out as a centered vertical tree,
// append buttons under a block's free declared ports, one add button per edge.
export function layoutWorkflow(
  model: WorkflowModel,
  portsOf: (block: BlockRef) => readonly string[] | undefined = () => undefined,
): ApLayout {
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

  const stepById = new Map(model.steps.map((step) => [step.id, step]));

  // Declared ports of a block, undefined until its form is known.
  const declared = (id: string): readonly string[] | undefined => {
    const step = stepById.get(id);
    if (id === model.trigger?.id) return portsOf(triggerBlock(model.trigger));
    const wired = (outgoing.get(id) ?? []).map((edge) => edge.port);
    return step
      ? stepPorts(stepBlock(step), step.config, portsOf, wired)
      : undefined;
  };
  // What a port reads as: a router branch's name, a loop's "For each item".
  const labelOf = (id: string, port: string): string | undefined => {
    const step = stepById.get(id);
    return step ? stepPortLabel(stepBlock(step), step.config, port) : undefined;
  };
  const outPorts = (id: string): string[] => {
    const ports = declared(id);
    return ports ? flowPorts(ports) : [];
  };
  // A block with several flow ports keeps a column for each, wired or not.
  const branchPorts = (id: string): string[] => {
    const ports = outPorts(id);
    return ports.length > 1 ? ports : [];
  };

  // A step several reachable edges enter hangs under the path it continues,
  // as the overview track picks it, a row below its deepest source; the
  // others are cross edges.
  const reachable = reachableFrom(model.trigger.id, model.edges);
  const via = new Map<string, EdgeModel>();
  for (const node of graphLayout({
    triggerId: model.trigger.id,
    steps: model.steps,
    edges: model.edges,
  }).nodes) {
    if (node.via) via.set(node.step.id, node.via as EdgeModel);
  }
  const pending = new Map<string, number>();
  for (const list of outgoing.values()) {
    for (const edge of list) {
      if (!reachable.has(edge.from)) continue;
      pending.set(edge.to, (pending.get(edge.to) ?? 0) + 1);
    }
  }
  const owner = new Map<string, EdgeModel>();
  const row = new Map<string, number>();
  const visited = new Set<string>();
  const visit = (id: string, gated: boolean) => {
    visited.add(id);
    for (const edge of outgoing.get(id) ?? []) {
      if (visited.has(edge.to)) continue;
      const below = row.get(id)! + 1;
      row.set(edge.to, gated ? Math.max(row.get(edge.to) ?? 0, below) : below);
      if (gated) {
        const left = pending.get(edge.to)! - 1;
        pending.set(edge.to, left);
        if (left > 0) continue;
      }
      const parent = gated ? via.get(edge.to) : undefined;
      const wired = parent && outgoing.get(parent.from)?.includes(parent);
      owner.set(edge.to, wired ? parent : edge);
      visit(edge.to, gated);
    }
  };
  row.set(model.trigger.id, 0);
  visit(model.trigger.id, true);
  // Unreachable steps (and any cycle) form plain trees, each root at row 0.
  const roots: string[] = [];
  for (const step of model.steps) {
    if (visited.has(step.id)) continue;
    roots.push(step.id);
    row.set(step.id, 0);
    visit(step.id, false);
  }
  const owns = (edge: EdgeModel) => owner.get(edge.to) === edge;

  // An unwired branch port still occupies a column: it gets a placeholder card
  // where its step would go, so both branches read as branches. A cross edge
  // gets an empty column too, the lane it runs down.
  const outletsOf = (id: string): { port: string; edge?: EdgeModel }[] => {
    const edges = outgoing.get(id) ?? [];
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

  const subtreeWidth = (id: string): number => {
    const outlets = outletsOf(id);
    if (outlets.length === 0) return STEP_WIDTH;
    const total = outlets
      .map((outlet) =>
        outlet.edge && owns(outlet.edge)
          ? subtreeWidth(outlet.edge.to)
          : STEP_WIDTH,
      )
      .reduce((sum, width) => sum + width, 0);
    return Math.max(STEP_WIDTH, total + (outlets.length - 1) * HSPACE);
  };

  // Centre of the column reserved for an unwired port, keyed "stepId:port".
  const placeholders = new Map<string, { x: number; y: number }>();
  // Centre of the column each edge runs down, keyed by edge id.
  const lanes = new Map<string, number>();
  const ROW = STEP_HEIGHT + VSPACE;

  const place = (id: string, centerX: number, top: number) => {
    const step = stepById.get(id);
    const isTrigger = id === model.trigger?.id;
    const y = top + row.get(id)! * ROW;
    nodes.push({
      id,
      type: "apStep",
      position: { x: centerX - STEP_WIDTH / 2, y },
      data: {
        ...(isTrigger
          ? { kind: "trigger", trigger: model.trigger }
          : { kind: "step", step }),
        outgoingPorts: model.edges
          .filter((edge) => edge.from === id)
          .map((edge) => edge.port),
      },
      draggable: false,
    });

    const outlets = outletsOf(id);
    const widths = outlets.map((outlet) =>
      outlet.edge && owns(outlet.edge)
        ? subtreeWidth(outlet.edge.to)
        : STEP_WIDTH,
    );
    const total =
      widths.reduce((sum, width) => sum + width, 0) +
      Math.max(outlets.length - 1, 0) * HSPACE;
    let cursor = centerX - total / 2;
    outlets.forEach((outlet, index) => {
      const slotCenter = cursor + widths[index] / 2;
      if (outlet.edge) {
        lanes.set(outlet.edge.id, slotCenter);
        if (owns(outlet.edge)) place(outlet.edge.to, slotCenter, top);
      } else {
        placeholders.set(`${id}:${outlet.port}`, { x: slotCenter, y: y + ROW });
      }
      cursor += widths[index] + HSPACE;
    });
  };

  place(model.trigger.id, 0, 0);

  // Steps unreachable from the trigger stack in a column to the right.
  const mainWidth = subtreeWidth(model.trigger.id);
  let orphanY = 0;
  for (const root of roots) {
    const before = nodes.length;
    place(root, mainWidth / 2 + HSPACE + STEP_WIDTH / 2, orphanY);
    const bottom = Math.max(
      ...nodes.slice(before).map((node) => node.position.y),
    );
    orphanY = bottom + ROW;
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (const edge of model.edges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) continue;
    edges.push({
      id: edge.id,
      type: "apEdge",
      source: edge.from,
      target: edge.to,
      data: {
        edgeId: edge.id,
        port: edge.port,
        portLabel: labelOf(edge.from, edge.port),
        lane: lanes.get(edge.id),
        condition: edge.condition,
        // A skipped step passes the run straight through this edge.
        fromSkipped: stepById.get(edge.from)?.skip === true,
        // On a port its source never takes: drawn, but as an error.
        dead: declared(edge.from)?.includes(edge.port) === false,
      },
      selectable: true,
    });
  }

  // Append buttons under every free flow port the block declares.
  const candidatePorts = outPorts;

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
        data: {
          parentId: node.id,
          port,
          portLabel: labelOf(node.id, port),
          card: Boolean(slot),
          // An empty workflow says where its first step goes.
          ...(model.steps.length === 0 ? { hint: true } : {}),
        },
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

  // A light frame behind each loop body: its steps and their add buttons.
  const LOOP_PAD = 16;
  const sizeOf = (node: Node) =>
    node.type === "apAppend" && !(node.data as { card?: boolean }).card
      ? { width: ADD_BUTTON_SIZE, height: ADD_BUTTON_SIZE }
      : { width: STEP_WIDTH, height: STEP_HEIGHT };
  const frames: Node[] = [];
  for (const edge of model.edges) {
    if (edge.port !== "each" || !owns(edge)) continue;
    const body = new Set<string>();
    const collect = (id: string) => {
      body.add(id);
      for (const next of outgoing.get(id) ?? []) {
        if (owns(next)) collect(next.to);
      }
    };
    collect(edge.to);
    const members = nodes.filter((node) =>
      node.type === "apStep"
        ? body.has(node.id)
        : body.has((node.data as { parentId?: string }).parentId ?? ""),
    );
    const left = Math.min(...members.map((node) => node.position.x));
    const top = Math.min(...members.map((node) => node.position.y));
    const right = Math.max(
      ...members.map((node) => node.position.x + sizeOf(node).width),
    );
    const bottom = Math.max(
      ...members.map((node) => node.position.y + sizeOf(node).height),
    );
    frames.push({
      id: `__loop:${edge.from}`,
      type: "apLoopFrame",
      position: { x: left - LOOP_PAD, y: top - LOOP_PAD },
      data: {
        width: right - left + 2 * LOOP_PAD,
        height: bottom - top + 2 * LOOP_PAD,
      },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
      // Clicks inside the frame reach the pane.
      style: { pointerEvents: "none" },
    });
  }

  return { nodes: [...frames, ...nodes], edges };
}

// Steps in the order a run meets them (depth first, branches in port order),
// then anything the trigger can't reach, in authored order.
export function flowOrder(model: WorkflowModel): string[] {
  const stepIds = new Set(model.steps.map((step) => step.id));
  const seen = new Set<string>();
  const order: string[] = [];
  const visit = (from: string) => {
    const next = model.edges
      .filter((edge) => edge.from === from && stepIds.has(edge.to))
      .sort((a, b) => portRank(a.port) - portRank(b.port));
    for (const edge of next) {
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      order.push(edge.to);
      visit(edge.to);
    }
  };
  if (model.trigger) visit(model.trigger.id);
  for (const step of model.steps) {
    if (!seen.has(step.id)) order.push(step.id);
  }
  return order;
}
