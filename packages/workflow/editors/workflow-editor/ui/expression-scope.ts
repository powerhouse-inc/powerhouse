// Builds the {} picker scope for a step: upstream step outputs and the
// trigger payload from the latest run when journaled, authored shapes otherwise.
import type { WorkflowModel } from "./model.js";

export interface ExpressionScope {
  // { trigger: { payload }, steps: { key: { output } }, variables: {...} }.
  value: Record<string, unknown>;
  // Caption per subtree root path, e.g. "steps.fetch.output" → "from run 09:14".
  captions: Record<string, string>;
}

export const EMPTY_SCOPE: ExpressionScope = { value: {}, captions: {} };

export interface ScopeRunStep {
  stepKey: string;
  blockType: string;
  status: string;
  output: unknown;
}

export interface ScopeRun {
  startedAt: string;
  triggerPayload: unknown;
  steps: ScopeRunStep[];
}

export interface BuildScopeOptions {
  model: WorkflowModel;
  stepId: string;
  latestRun?: ScopeRun;
  // Authored output shape of a block (declared types as leaves).
  authoredOutput: (blockType: string, config: unknown) => Promise<unknown>;
  now?: Date;
}

const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 25;

// Run outputs can be huge; the picker only needs a browsable prefix.
export function capValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return Array.isArray(value) ? "[…]" : "{…}";
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => capValue(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      capValue(entry, depth + 1),
    ]),
  );
}

export function upstreamStepIds(
  model: WorkflowModel,
  stepId: string,
): Set<string> {
  const incoming = new Map<string, string[]>();
  for (const edge of model.edges) {
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from]);
  }
  const upstream = new Set<string>();
  const queue = [stepId];
  while (queue.length > 0) {
    for (const from of incoming.get(queue.pop()!) ?? []) {
      if (!upstream.has(from)) {
        upstream.add(from);
        queue.push(from);
      }
    }
  }
  return upstream;
}

export function formatRunTime(startedAt: string, now = new Date()): string {
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return startedAt;
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return sameDay
    ? time
    : `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

const hasOutput = (step: ScopeRunStep) =>
  (step.status === "SUCCEEDED" || step.status === "REPLAYED") &&
  step.output !== undefined &&
  step.output !== null;

export async function buildExpressionScope(
  options: BuildScopeOptions,
): Promise<ExpressionScope> {
  const { model, latestRun } = options;
  const runCaption = latestRun
    ? `from run ${formatRunTime(latestRun.startedAt, options.now)}`
    : undefined;
  const runSteps = new Map(
    (latestRun?.steps ?? [])
      .filter(hasOutput)
      .map((step) => [step.stepKey, step]),
  );
  const value: Record<string, unknown> = {};
  const captions: Record<string, string> = {};

  if (model.trigger) {
    if (
      runCaption &&
      latestRun?.triggerPayload !== undefined &&
      latestRun.triggerPayload !== null
    ) {
      value.trigger = { payload: capValue(latestRun.triggerPayload) };
      captions["trigger.payload"] = runCaption;
    } else {
      value.trigger = {
        payload: await options.authoredOutput(
          model.trigger.blockType,
          model.trigger.config,
        ),
      };
      captions["trigger.payload"] = "declared type";
    }
  }

  const upstream = upstreamStepIds(model, options.stepId);
  const steps: Record<string, unknown> = {};
  await Promise.all(
    model.steps
      .filter((step) => upstream.has(step.id))
      .map(async (step) => {
        const journaled = runSteps.get(step.key);
        // A renamed/retyped step's old output would mislead: match on both.
        if (runCaption && journaled && journaled.blockType === step.blockType) {
          steps[step.key] = { output: capValue(journaled.output) };
          captions[`steps.${step.key}.output`] = runCaption;
          return;
        }
        steps[step.key] = {
          output: await options.authoredOutput(step.blockType, step.config),
        };
        captions[`steps.${step.key}.output`] = "declared type";
      }),
  );
  // Omit empty groups so the picker never offers a bare {{steps}}.
  if (Object.keys(steps).length > 0) value.steps = steps;

  if (model.variables.length > 0) {
    value.variables = Object.fromEntries(
      model.variables.map((variable) => [variable.key, variable.value ?? null]),
    );
    captions.variables = "workflow variables";
  }
  return { value, captions };
}
