// Lists a workflow's steps in the order a run reaches them, so the studio
// can show the shape of a workflow without drawing the canvas.

export interface OutlineStep {
  id: string;
  key: string;
  name: string;
  pieceName: string;
  pieceVersion: string;
  actionName: string;
}

export interface OutlineEdge {
  from: string;
  to: string;
  port: string;
}

export interface OutlineRow {
  step: OutlineStep;
  // The port of the first inbound edge decided; null on an entry and "next".
  port: string | null;
}

export interface StepOutline {
  rows: OutlineRow[];
  // Steps a run never reaches: unreachable, cyclic or fed by a missing step.
  orphans: OutlineStep[];
}

// The coordinator's order (reactor-workflow runWorkflow): passes over the
// steps array, each step once every inbound edge is decided (an OR join).
export function stepOutline(args: {
  triggerId?: string | null;
  steps: readonly OutlineStep[];
  edges: readonly OutlineEdge[];
}): StepOutline {
  const inbound = new Map<string, OutlineEdge[]>();
  for (const edge of args.edges) {
    const list = inbound.get(edge.to) ?? [];
    list.push(edge);
    inbound.set(edge.to, list);
  }
  // A source's edges are all decided once it runs or is skipped; which port
  // it takes changes what runs, never the order steps are reached in.
  const decided: string[] = args.triggerId ? [args.triggerId] : [];
  const rows: OutlineRow[] = [];
  const seen = new Set<string>();
  const firstDecided = (edges: OutlineEdge[]) =>
    edges.reduce((first, edge) =>
      decided.indexOf(edge.from) < decided.indexOf(first.from) ? edge : first,
    );

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const step of args.steps) {
      if (seen.has(step.id)) continue;
      const edges = inbound.get(step.id) ?? [];
      const entry = !args.triggerId && edges.length === 0;
      if (!entry) {
        if (edges.length === 0) continue;
        if (!edges.every((edge) => decided.includes(edge.from))) continue;
      }
      seen.add(step.id);
      decided.push(step.id);
      const port = entry ? null : firstDecided(edges).port;
      rows.push({ step, port: port === "next" ? null : port });
      progressed = true;
    }
  }

  return {
    rows,
    orphans: args.steps.filter((step) => !seen.has(step.id)),
  };
}
