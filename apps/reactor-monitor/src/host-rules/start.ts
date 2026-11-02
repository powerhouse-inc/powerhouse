// Whether the controller can start or check a draft, and why not. Browser-safe.

export const START_REASONS = {
  running: "A copy is already running. Stop it first.",
  noReactors: "This host has no reactors yet. Add one on Reactors.",
  noController: "Starting needs the monitor's controller, which isn't running.",
  noProject: "Starting needs a project to run in. Choose one above.",
  checking: "Checking whether the controller can start this host.",
  notServed:
    "This host comes from a project the monitor can't start. Download it instead.",
  projectGone: "The controller no longer serves that project. Choose another.",
  notWired: "Starting from the builder isn't available yet.",
  blankImport:
    "A downloaded blank host has no project to start in. Start a new blank host here, or copy its host.js into a project and load it from there.",
} as const;

export const CHECK_REASONS = {
  noProject: "Checking needs a project to run in. Choose one on Use it.",
  blankImport:
    "A downloaded blank host has no project to check it in. Start a new blank host to check it.",
} as const;

export function fixIssuesFirst(count: number): string {
  return count === 1
    ? "Fix the issue on Review first."
    : `Fix the ${count} issues on Review first.`;
}

export type StartState = {
  readonly issues: number;
  readonly reactors: number;
  readonly controller: boolean;
  /** A blank host runs in the project chosen for it; none until one is. */
  readonly blank?: { readonly project?: string };
  /** An imported export of a blank host: it names no project. */
  readonly blankImport?: boolean;
  /** Whether the controller serves the project; undefined while asking. */
  readonly served: boolean | undefined;
  readonly wired: boolean;
  readonly running?: boolean;
};

/** Why Start is off, if it is. */
export function startReason(state: StartState): string | undefined {
  if (state.running) return START_REASONS.running;
  if (state.issues > 0) return fixIssuesFirst(state.issues);
  if (state.reactors === 0) return START_REASONS.noReactors;
  if (state.blankImport) return START_REASONS.blankImport;
  if (!state.controller) return START_REASONS.noController;
  if (state.blank && !state.blank.project) return START_REASONS.noProject;
  if (state.served === undefined) return START_REASONS.checking;
  if (!state.served) {
    return state.blank ? START_REASONS.projectGone : START_REASONS.notServed;
  }
  if (!state.wired) return START_REASONS.notWired;
  return undefined;
}

/** Why the controller can't check the draft, if it can't. */
export function checkReason(
  state: Pick<StartState, "blank" | "blankImport">,
): string | undefined {
  if (state.blankImport) return CHECK_REASONS.blankImport;
  return state.blank && !state.blank.project
    ? CHECK_REASONS.noProject
    : undefined;
}
