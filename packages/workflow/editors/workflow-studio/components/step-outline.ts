// Flattens a workflow's graph into the order a run walks it, so the studio
// can show the shape of a workflow without drawing the canvas.
import { portRank } from "../../workflow-editor/ui/ap-layout.js";

export interface OutlineStep {
  id: string;
  key: string;
  name: string;
  blockType: string;
}

export interface OutlineEdge {
  from: string;
  to: string;
  port: string;
}

export interface OutlineRow {
  step: OutlineStep;
  // The port that led here; null on the entry step and on "next".
  port: string | null;
}

export interface StepOutline {
  rows: OutlineRow[];
  // Authored but unreachable from the trigger, so no run ever executes them.
  orphans: OutlineStep[];
}

export function stepOutline(args: {
  triggerId?: string | null;
  steps: readonly OutlineStep[];
  edges: readonly OutlineEdge[];
}): StepOutline {
  const stepById = new Map(args.steps.map((step) => [step.id, step]));
  const outgoing = new Map<string, OutlineEdge[]>();
  for (const edge of args.edges) {
    if (!stepById.has(edge.to)) continue;
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
  }
  for (const list of outgoing.values()) {
    list.sort((a, b) => portRank(a.port) - portRank(b.port));
  }

  const rows: OutlineRow[] = [];
  const seen = new Set<string>();
  // Depth-first so a branch reads as a continuous path, as it runs.
  const walk = (fromId: string, port: string | null) => {
    const step = stepById.get(fromId);
    if (step) {
      if (seen.has(fromId)) return;
      seen.add(fromId);
      rows.push({ step, port: port === "next" ? null : port });
    }
    for (const edge of outgoing.get(fromId) ?? []) {
      walk(edge.to, edge.port);
    }
  };
  if (args.triggerId) walk(args.triggerId, null);

  return {
    rows,
    orphans: args.steps.filter((step) => !seen.has(step.id)),
  };
}
