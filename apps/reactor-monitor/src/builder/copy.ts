// The builder's own wording. Option labels and reasons come from host-rules.
import type { MemberRole, OptionGroup } from "../host-rules/index.js";
import type { StepId } from "./draft.js";

export const STEP_LABELS: Record<StepId, string> = {
  start: "Start",
  basics: "Host basics",
  members: "Reactors",
  reactor: "Configure each reactor",
  environment: "Environment",
  review: "Review",
  use: "Use it",
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  switchboard: "Switchboard",
  connect: "Connect",
  other: "Other reactor",
};

export const GROUP_LABELS: Record<OptionGroup, string> = {
  access: "Access control",
  storage: "Storage",
  backendKind: "Where it runs",
  hotReload: "Hot reload",
  workers: "Background workers",
  projectionWorker: "Separate thread for search data",
  add: "Add a reactor",
};

export const NO_CONTROLLER =
  "This needs the monitor's controller, which isn't running.";

export const START_BLOCKERS = {
  noController: "Starting needs the monitor's controller, which isn't running.",
  notServed:
    "This host comes from a project the monitor can't start. Download it instead.",
  checking: "Checking whether the controller can start this host.",
  notWired: "Starting from the builder isn't available yet.",
} as const;

export function issueCount(count: number): string {
  if (count === 0) return "No issues";
  return count === 1 ? "1 issue" : `${count} issues`;
}

export function fixIssuesFirst(count: number): string {
  return count === 1
    ? "Fix the issue on Review first."
    : `Fix the ${count} issues on Review first.`;
}
