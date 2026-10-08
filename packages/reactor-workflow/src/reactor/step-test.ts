// Single-step testing: which parts of the run scope a step's config reads, and
// the draft step in engine shape.
import type { WorkflowState } from "@powerhousedao/workflow/document-models/workflow";
import {
  expressionsIn,
  type Expression,
  type StepExecutionStatus,
  type WorkflowStepDef,
} from "../pieces/index.js";
import { propertySettings } from "./lib.js";

export interface StepTestResult {
  // Null when the test never started: an upstream sample was missing.
  runId: string | null;
  // INDETERMINATE is its own answer, not a shade of either other one: a host
  // call the block made timed out, so a write it asked for may well have
  // landed. See "Indeterminate steps" in README.md.
  status: "SUCCEEDED" | "FAILED" | "INDETERMINATE";
  output?: unknown;
  error?: string;
  errorName?: string;
  durationMs: number;
}

/**
 * A step record's status as a test reports it.
 *
 * Collapsing this to `FAILED : SUCCEEDED` is how an INDETERMINATE test came
 * to read green — the one status that must never be mistaken for a confirmed
 * one, since the whole point of it is that nobody knows whether the write
 * landed.
 */
export function testStatusOf(
  status: StepExecutionStatus,
): StepTestResult["status"] {
  if (status === "FAILED") return "FAILED";
  if (status === "INDETERMINATE") return "INDETERMINATE";
  return "SUCCEEDED";
}

// What a single-step test reads a tested block's sample from. "truncated"
// means the journal capped the last test's output to a marker (store.ts,
// STEP_PAYLOAD_MAX_BYTES): there is a test on record, but no data to serve.
// "indeterminate" means the test neither succeeded nor failed, so it has no
// output a downstream draft step may stand on.
export type TestSample =
  | { kind: "untested" | "stale" | "hidden" | "truncated" | "indeterminate" }
  | { kind: "failed"; runId: string; testedAt: string; error: string }
  | { kind: "succeeded"; runId: string; testedAt: string; output: unknown };

export interface ScopeReferences {
  trigger: boolean;
  // A bare {{steps}} reads every upstream step.
  allSteps: boolean;
  // Step key → fields read ("output", "error", or "*" for the whole entry).
  steps: Map<string, Set<string>>;
}

function collectStrings(value: unknown, into: string[]): void {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value))
    for (const item of value) collectStrings(item, into);
  else if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value)) collectStrings(entry, into);
  }
}

/** The trigger and step entries a config's strings read. */
export function scopeReferences(config: unknown): ScopeReferences {
  const refs: ScopeReferences = {
    trigger: false,
    allSteps: false,
    steps: new Map(),
  };
  const strings: string[] = [];
  collectStrings(config, strings);
  for (const text of strings) {
    let expressions: Expression[];
    try {
      expressions = expressionsIn(text);
    } catch {
      // A malformed expression fails the test run itself, with its own message.
      continue;
    }
    for (const term of expressions.flatMap((expression) => expression.terms)) {
      if (term.kind !== "path") continue;
      const [root, key, field] = term.segments;
      if (root === "trigger") refs.trigger = true;
      if (root !== "steps") continue;
      if (term.segments.length < 2) {
        refs.allSteps = true;
        continue;
      }
      const fields = refs.steps.get(String(key)) ?? new Set<string>();
      fields.add(term.segments.length > 2 ? String(field) : "*");
      refs.steps.set(String(key), fields);
    }
  }
  return refs;
}

/** Steps with a path to `stepId` along the draft's edges. */
export function upstreamStepIds(
  state: Pick<WorkflowState, "edges">,
  stepId: string,
): Set<string> {
  const incoming = new Map<string, string[]>();
  for (const edge of state.edges) {
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

/** A draft step in engine shape; a test runs it even when it is skipped. */
export function draftStepDef(
  step: WorkflowState["steps"][number],
): WorkflowStepDef {
  return {
    id: step.id,
    key: step.key,
    name: step.name,
    pieceName: step.pieceName,
    pieceVersion: step.pieceVersion,
    actionName: step.actionName,
    connectionId: step.connectionId,
    reactorConnectionId: step.reactorConnectionId,
    config: step.config,
    timeoutSeconds: step.timeoutSeconds,
    propertySettings: propertySettings(step.propertySettings),
    skip: false,
  };
}

/** A run's payload is one trigger item; a trigger test returns the list. */
export function triggerSamplePayload(output: unknown): {
  payload?: unknown;
  empty: boolean;
} {
  if (!Array.isArray(output)) return { payload: output, empty: false };
  return output.length > 0
    ? { payload: output[0] as unknown, empty: false }
    : { empty: true };
}

export function untestedError(label: string, sample: TestSample): string {
  switch (sample.kind) {
    case "stale":
      return `Test ${label} first: it changed since its last test`;
    case "hidden":
      return `Test ${label} first: its last test is not visible to you`;
    case "failed":
      return `Test ${label} first: its last test failed`;
    case "truncated":
      return `Test ${label} again: the journal kept only a truncated copy of its last output`;
    case "indeterminate":
      return `Test ${label} again: its last test is INDETERMINATE, so it has no confirmed output`;
    default:
      return `Test ${label} first`;
  }
}
