// A loop's body: the steps reachable from its "each" edges. A body is closed,
// entered only through those edges and left by none.
import {
  CALL_FLOW_ACTION,
  CORE_PIECE_NAME,
  LOOP_ACTION,
  LOOP_EACH_PORT,
  SUBFLOWS_PIECE,
} from "@powerhousedao/pieces-framework/workflow";
import { canonicalJson, hashOf, stepConfigHash } from "./canonical.js";
import type { WorkflowDefinition, WorkflowStepDef } from "./types.js";

export interface LoopStructure {
  // Loop step id -> its body's step ids, nested bodies included.
  bodies: Map<string, Set<string>>;
  // Step id -> the innermost loop whose body holds it.
  owner: Map<string, string>;
  // Why the definition's loops cannot run; undefined when they can.
  violation?: string;
}

export function isLoopStep(step: WorkflowStepDef): boolean {
  return step.pieceName === CORE_PIECE_NAME && step.actionName === LOOP_ACTION;
}

// Activepieces' Call Flow suspends the run when it waits for the callee.
export function waitsForCallee(step: WorkflowStepDef, input: unknown): boolean {
  return (
    step.pieceName === SUBFLOWS_PIECE &&
    step.actionName === CALL_FLOW_ACTION &&
    typeof input === "object" &&
    input !== null &&
    (input as { waitForResponse?: unknown }).waitForResponse === true
  );
}

export function loopStructure(
  definition: Pick<WorkflowDefinition, "steps" | "edges">,
): LoopStructure {
  const { steps, edges } = definition;
  const keyOf = new Map(steps.map((step) => [step.id, step.key]));
  const key = (id: string) => keyOf.get(id) ?? id;
  const bodies = new Map<string, Set<string>>();
  let violation: string | undefined;
  for (const loop of steps.filter(isLoopStep)) {
    const body = new Set<string>();
    const queue = edges
      .filter((edge) => edge.from === loop.id && edge.port === LOOP_EACH_PORT)
      .map((edge) => edge.to);
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (body.has(id) || id === loop.id) continue;
      body.add(id);
      for (const edge of edges) {
        if (edge.from !== id) continue;
        queue.push(edge.to);
        // The loop would wait on an edge only its own body decides.
        if (edge.to === loop.id) {
          violation ??=
            `Step "${key(id)}" in the body of loop "${loop.key}" leads back ` +
            "to the loop; the loop runs its body again for each item by itself";
        }
      }
    }
    bodies.set(loop.id, body);
    if (violation) continue;
    // Everything the body reaches is in it, so a body that leads out shows
    // as a body step that is also reached from outside.
    for (const edge of edges) {
      const entry = edge.from === loop.id && edge.port === LOOP_EACH_PORT;
      if (!body.has(edge.to) || body.has(edge.from) || entry) continue;
      const inside = edges.find(
        (other) => other.to === edge.to && body.has(other.from),
      );
      violation = inside
        ? `Step "${key(edge.to)}" is reached both from "${key(inside.from)}" in ` +
          `the body of loop "${loop.key}" and from "${key(edge.from)}" outside ` +
          `it; a loop body can only continue through the loop's "next" port`
        : `Step "${key(edge.to)}" in the body of loop "${loop.key}" is also ` +
          `reached from "${key(edge.from)}" outside it`;
      break;
    }
  }
  // Nested bodies are strictly smaller, so the smallest holder is innermost.
  const owner = new Map<string, string>();
  for (const [loopId, body] of bodies) {
    for (const id of body) {
      const current = owner.get(id);
      if (!current || bodies.get(current)!.size > body.size) {
        owner.set(id, loopId);
      }
    }
  }
  return { bodies, owner, ...(violation ? { violation } : {}) };
}

// A loop row's config hash: the loop's own, and its body's steps and edges,
// so a rerun tells a rewired body from the one that ran.
export function loopConfigHash(
  loop: WorkflowStepDef,
  definition: Pick<WorkflowDefinition, "steps" | "edges">,
  structure: LoopStructure = loopStructure(definition),
): string {
  const body = structure.bodies.get(loop.id) ?? new Set<string>();
  const edges = definition.edges
    .filter(
      (edge) =>
        body.has(edge.from) ||
        (edge.from === loop.id && edge.port === LOOP_EACH_PORT),
    )
    .map((edge) =>
      canonicalJson({
        from: edge.from,
        to: edge.to,
        port: edge.port,
        condition: edge.condition ?? null,
      }),
    )
    .sort();
  return hashOf(
    stepConfigHash(loop),
    canonicalJson({ body: [...body].sort(), edges }),
  );
}
