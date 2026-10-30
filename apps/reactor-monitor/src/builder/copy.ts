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
  reach: "Where this app keeps its drives",
  placement: "Where this drive opens",
  port: "Ports",
};

export const DRIVES_COPY = {
  inBrowser: "In this browser",
  defaultReactor:
    "Connect keeps its own reactor here until you choose where it runs.",
  onSwitchboard: (drive: string, switchboard: string) =>
    `${drive} on ${switchboard}`,
  add: "Add",
  addDrive: (switchboard: string) => `Add a drive to ${switchboard}`,
  driveName: "Drive name",
  addButton: "Add drive",
  newDrives: "New drives are created in this browser.",
  moveLater: "You can move drives in Router after starting.",
} as const;

export const RUN_COPY = {
  route: "Route this app's reactors",
} as const;

export const SAVE_PLACEMENT = {
  noDraft: "The builder has no draft to save to. Open the host in Build host.",
  otherHost:
    "The builder's draft is a different host now. Open this one in Build host to save.",
  noApp: (app: string) => `The builder's draft no longer has ${app}.`,
  already: "The builder's draft already places it there.",
  refused: "The builder can't save this move.",
} as const;

export const NO_CONTROLLER =
  "This needs the monitor's controller, which isn't running.";

export const START_BLOCKERS = {
  noController: "Starting needs the monitor's controller, which isn't running.",
  notServed:
    "This host comes from a project the monitor can't start. Download it instead.",
  checking: "Checking whether the controller can start this host.",
  notWired: "Starting from the builder isn't available yet.",
  running: "A copy is already running. Stop it first.",
} as const;

export const START_GONE = "The controller no longer has the copy.";

export const NO_ADDRESS_YET =
  "it has no fixed port, so its address is only known once it starts.";

export function issueCount(count: number): string {
  if (count === 0) return "No issues";
  return count === 1 ? "1 issue" : `${count} issues`;
}

export function fixIssuesFirst(count: number): string {
  return count === 1
    ? "Fix the issue on Review first."
    : `Fix the ${count} issues on Review first.`;
}
