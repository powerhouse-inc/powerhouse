// Builds the {} picker scope for a step: upstream step outputs and the trigger
// payload from their last test, else the latest run, else the authored shape.
import {
  documentRefsIn,
  expandDocumentRefs,
  type DocumentReference,
} from "@powerhousedao/pieces-framework/workflow";
import { stepBlock, triggerBlock, type BlockRef } from "./blocks.js";
import { documentShape } from "./document-shape.js";
import type { WorkflowModel } from "./model.js";
import { VARIABLE_TYPE_LABEL } from "./variable-types.js";

export interface ExpressionScope {
  // { trigger: { payload }, steps: { key: { output } }, variables: {...} }.
  value: Record<string, unknown>;
  // Caption per subtree root path, e.g. "steps.fetch.output" → "from run 09:14".
  captions: Record<string, string>;
}

export const EMPTY_SCOPE: ExpressionScope = { value: {}, captions: {} };

export interface ScopeRunStep {
  stepKey: string;
  pieceName: string;
  blockName: string;
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
  authoredOutput: (block: BlockRef, config: unknown) => Promise<unknown>;
  // A block's last test sample, by step or trigger id; undefined when none.
  testOutput?: (blockId: string) => Promise<TestSample | undefined>;
  // A journaled document reference as a document: header and state fields.
  documentOutput?: (
    reference: DocumentReference,
  ) => Promise<Record<string, unknown>>;
  now?: Date;
}

export interface TestSample {
  value: unknown;
  testedAt: string;
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

// Each journaled document reference in a value, as the document it names.
async function withDocuments(
  value: unknown,
  documentOutput: BuildScopeOptions["documentOutput"],
): Promise<unknown> {
  const references = documentRefsIn(value);
  if (references.length === 0) return value;
  const key = (reference: DocumentReference) =>
    `${reference.branch}:${reference.documentId}`;
  // Header fields at least, when the model is unknown here.
  const shapeOf = async (reference: DocumentReference) => {
    try {
      if (documentOutput) return await documentOutput(reference);
    } catch {
      // Falls through to the header-only shape.
    }
    return documentShape(reference, {});
  };
  const shapes = new Map(
    await Promise.all(
      references.map(
        async (reference) =>
          [key(reference), await shapeOf(reference)] as const,
      ),
    ),
  );
  return expandDocumentRefs(value, (reference) => shapes.get(key(reference))!);
}

export async function buildExpressionScope(
  options: BuildScopeOptions,
): Promise<ExpressionScope> {
  const { model, latestRun } = options;
  const documents = (value: unknown) =>
    withDocuments(value, options.documentOutput);
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

  const testCaption = (sample: TestSample) =>
    `from test ${formatRunTime(sample.testedAt, options.now)}`;
  const tested = async (block: { id: string; lastTest?: unknown }) =>
    block.lastTest && options.testOutput
      ? options.testOutput(block.id).catch(() => undefined)
      : undefined;

  if (model.trigger) {
    const sample = await tested(model.trigger);
    if (sample) {
      value.trigger = { payload: capValue(await documents(sample.value)) };
      captions["trigger.payload"] = testCaption(sample);
    } else if (
      runCaption &&
      latestRun?.triggerPayload !== undefined &&
      latestRun.triggerPayload !== null
    ) {
      value.trigger = {
        payload: capValue(await documents(latestRun.triggerPayload)),
      };
      captions["trigger.payload"] = runCaption;
    } else {
      value.trigger = {
        payload: await options.authoredOutput(
          triggerBlock(model.trigger),
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
        const sample = await tested(step);
        if (sample) {
          steps[step.key] = { output: capValue(await documents(sample.value)) };
          captions[`steps.${step.key}.output`] = testCaption(sample);
          return;
        }
        const journaled = runSteps.get(step.key);
        // A renamed/retyped step's old output would mislead: match on both.
        if (
          runCaption &&
          journaled &&
          journaled.pieceName === step.pieceName &&
          journaled.blockName === step.actionName
        ) {
          steps[step.key] = {
            output: capValue(await documents(journaled.output)),
          };
          captions[`steps.${step.key}.output`] = runCaption;
          return;
        }
        steps[step.key] = {
          output: await options.authoredOutput(stepBlock(step), step.config),
        };
        captions[`steps.${step.key}.output`] = "declared type";
      }),
  );
  // Omit empty groups so the picker never offers a bare {{steps}}.
  if (Object.keys(steps).length > 0) value.steps = steps;

  if (model.variables.length > 0) {
    // A secret shows as such: its reference is no use in a field.
    value.variables = Object.fromEntries(
      model.variables.map((variable) => [
        variable.key,
        variable.type === "SECRET" ? "secret" : (variable.value ?? null),
      ]),
    );
    captions.variables = "workflow variables";
    for (const variable of model.variables) {
      if (variable.type) {
        captions[`variables.${variable.key}`] =
          VARIABLE_TYPE_LABEL[variable.type].toLowerCase();
      }
    }
  }
  return { value, captions };
}

// A path segment the picker can insert: dotted when it is an identifier,
// bracketed otherwise, and indexed inside arrays.
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function childPath(
  parent: string,
  key: string,
  parentIsArray: boolean,
): string {
  if (parentIsArray) return `${parent}[${key}]`;
  if (!parent) return key;
  return IDENTIFIER.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}
