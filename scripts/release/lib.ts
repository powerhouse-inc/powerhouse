// Shared constants, error classes, and the ReleaseContext type. Kept in a
// single file because each piece is tiny and they're conceptually "the
// data-model layer" of the script.

// ---------- constants -----------------------------------------------------

export const WORKFLOW_FILE = "release-branch.yml";
export const DISCORD_CHANNEL = "#coredev-releases";
export const RELEASE_NOTES_FILE = "RELEASE-NOTES.md";
export const SKILL_PATH = ".claude/skills/release-notes/SKILL.md";
export const DEFAULT_OWNER_REPO = "powerhouse-inc/powerhouse";
export const DISCORD_MARKER_START = "===DISCORD_MESSAGE_START===";
export const DISCORD_MARKER_END = "===DISCORD_MESSAGE_END===";

// ---------- errors --------------------------------------------------------

/**
 * User-initiated abort (Ctrl-C, declining a confirmAction, etc).
 * Translated to exit 130 + a `--resume-from=N` hint by the top-level
 * handler in index.ts.
 */
export class AbortError extends Error {
  readonly exitCode = 130;
  readonly resumeStep: number;

  constructor(resumeStep: number, message?: string) {
    super(message ?? `Aborted at Step ${resumeStep}.`);
    this.name = "AbortError";
    this.resumeStep = resumeStep;
  }
}

/** Unrecoverable script error. Translated to exit 1 by the top-level handler. */
export class FatalError extends Error {
  readonly exitCode = 1;

  constructor(message: string) {
    super(message);
    this.name = "FatalError";
  }
}

// ---------- context -------------------------------------------------------

/**
 * Built once by preflight, passed by value into every flow / action / step.
 * Most fields are read-only after construction; `currentStep`, `flowName`,
 * `targetSummary`, and `discordOutPath` are mutated as a flow progresses
 * (by ui.step() and the flows themselves).
 */
export interface ReleaseContext {
  /** --dry-run: skip push + workflow trigger. Local ops still run. */
  dryRun: boolean;

  /** --resume-from=N. 0 means no skip. */
  resumeFrom: number;

  /** gh CLI installed AND authenticated (auth checked in preflight). */
  hasGh: boolean;

  /** claude CLI installed. */
  hasClaude: boolean;

  /** "owner/repo" form, e.g. "powerhouse-inc/powerhouse". */
  repoPath: string;

  /** Absolute path to the git toplevel. */
  repoRoot: string;

  /** Current step number, written by ui.step(). Used by abort messaging. */
  currentStep: number;

  /** Set by production step 4; read by step 10. */
  discordOutPath?: string;

  // ---- UI state (rendered by ui.ts on every step entry) ----
  /** "DEV release" / "STAGING release" / "PRODUCTION release". */
  flowName?: string;
  /** One-line summary of the current target (branch, mode, dry-run flag). */
  targetSummary?: string;
  /** Title of the current step, written by ui.step(). Used by confirmAction
   * to redraw the banner between sub-actions so each action owns the screen. */
  currentStepTitle?: string;
  /** "4" or "?" — total-step label paired with currentStep for the banner. */
  currentStepTotal?: string;
}
