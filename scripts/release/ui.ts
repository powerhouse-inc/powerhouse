// UX layer: output helpers, screen banner, interactive prompts, step
// wrapper. All terminal-facing concerns live here.
//
// Output helpers (info / ok / warn / err / section / target box) bake in a
// two-space prefix so the layout is consistent. Callers should never
// write directly to stdout.
//
// Prompts wrap enquirer (lazy-imported to dodge ESM/CJS interop with tsx)
// and fall back to a readline numeric flow when stdin/stdout isn't a TTY.
// Enquirer cancellation (Ctrl-C) is translated to AbortError.
//
// step() clears the screen on every non-skipped entry and re-renders a
// persistent banner (flow name + target summary + step N/total) so each
// step "owns" the screen — wizard-style rather than scrolling transcript.

import chalk from "chalk";
import { createInterface } from "node:readline";

import { AbortError, type ReleaseContext } from "./lib.js";
import { runLocal } from "./exec.js";

// ---------- output helpers ------------------------------------------------

export { chalk };

export function info(message: string): void {
  process.stdout.write(`  ${message}\n`);
}

export function ok(message: string): void {
  process.stdout.write(`  ${chalk.green("✓")} ${message}\n`);
}

export function warn(message: string): void {
  process.stdout.write(`  ${chalk.yellow("⚠")} ${message}\n`);
}

export function err(message: string): void {
  process.stderr.write(`  ${chalk.red("✗")} ${message}\n`);
}

export function section(title: string): void {
  const bar = "═".repeat(62);
  process.stdout.write(`\n${chalk.bold(bar)}\n`);
  process.stdout.write(`${chalk.bold(`  ${title}`)}\n`);
  process.stdout.write(`${chalk.bold(bar)}\n`);
}

export function targetBox(...lines: string[]): void {
  const inner = 58;
  const horizontal = "─".repeat(inner + 2);
  process.stdout.write(`\n  ${chalk.dim(`┌${horizontal}┐`)}\n`);
  for (const line of lines) {
    const padded =
      line.length >= inner ? line.slice(0, inner) : line.padEnd(inner, " ");
    process.stdout.write(`  ${chalk.dim("│")} ${padded} ${chalk.dim("│")}\n`);
  }
  process.stdout.write(`  ${chalk.dim(`└${horizontal}┘`)}\n`);
}

export function restoreCursor(): void {
  process.stdout.write("\x1b[?25h");
}

// ---------- screen banner + step wrapper ---------------------------------

export function clearScreen(): void {
  process.stdout.write("\x1b[2J\x1b[H");
}

function renderBanner(
  ctx: ReleaseContext,
  num: number,
  totalLabel: string,
  title: string,
): void {
  const bar = "═".repeat(62);
  process.stdout.write(`${chalk.bold(bar)}\n`);
  process.stdout.write(
    `${chalk.bold(`  ${ctx.flowName ?? "Release helper"}`)}\n`,
  );
  if (ctx.targetSummary) {
    process.stdout.write(`  ${chalk.dim(ctx.targetSummary)}\n`);
  }
  process.stdout.write(`${chalk.bold(bar)}\n`);
  process.stdout.write(
    `\n${chalk.bold.blue(`▶ Step ${num}/${totalLabel}`)} ${chalk.bold(`— ${title}`)}\n`,
  );
}

/**
 * Banner-only screen with no step number. Used by intermediate prompts
 * (channel picker, staging sub-flow picker) that aren't numbered steps.
 */
export function renderScreen(ctx: ReleaseContext, title: string): void {
  clearScreen();
  const bar = "═".repeat(62);
  process.stdout.write(`${chalk.bold(bar)}\n`);
  process.stdout.write(
    `${chalk.bold(`  ${ctx.flowName ?? "Powerhouse release"}`)}\n`,
  );
  if (ctx.targetSummary) {
    process.stdout.write(`  ${chalk.dim(ctx.targetSummary)}\n`);
  }
  process.stdout.write(`${chalk.bold(bar)}\n`);
  process.stdout.write(`\n${chalk.bold(title)}\n`);
}

/**
 * Numbered step wrapper. Clears the screen + renders the banner on entry,
 * runs `fn`, returns its result. Steps below ctx.resumeFrom print a dim
 * "[skipped]" line without clearing (so the user sees the chain of skips).
 */
export async function step<T>(
  ctx: ReleaseContext,
  num: number,
  total: number | "?",
  title: string,
  fn: () => Promise<T> | T,
): Promise<T | undefined> {
  ctx.currentStep = num;
  const totalLabel = typeof total === "number" ? `${total}` : total;

  if (num < ctx.resumeFrom) {
    process.stdout.write(
      `\n${chalk.dim(
        `▶ Step ${num}/${totalLabel} — ${title}  [skipped: --resume-from=${ctx.resumeFrom}]`,
      )}\n`,
    );
    return undefined;
  }

  ctx.currentStepTitle = title;
  ctx.currentStepTotal = totalLabel;
  clearScreen();
  renderBanner(ctx, num, totalLabel, title);
  return await fn();
}

/**
 * Clear + redraw banner + step header. Called before each interactive
 * sub-action inside a step so every prompt owns the screen.
 */
function redrawStep(ctx: ReleaseContext): void {
  if (!ctx.currentStepTitle || !ctx.currentStepTotal) return;
  clearScreen();
  renderBanner(
    ctx,
    ctx.currentStep,
    ctx.currentStepTotal,
    ctx.currentStepTitle,
  );
}

// ---------- prompts (TTY-aware) -------------------------------------------

function isTty(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Wrap an enquirer call so Ctrl-C (which it surfaces as an empty-string
 * rejection) becomes AbortError(ctx.currentStep).
 */
async function runEnquirer<T>(
  ctx: ReleaseContext,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    // Ctrl-C surfaces as: undefined, null, "", an Error with empty message,
    // or an ERR_USE_AFTER_CLOSE thrown by enquirer's stop() racing the
    // closed readline. Treat all of them as a user-initiated abort.
    const code = (e as { code?: string } | null)?.code;
    if (
      e === undefined ||
      e === null ||
      e === "" ||
      (e instanceof Error && e.message === "") ||
      code === "ERR_USE_AFTER_CLOSE"
    ) {
      throw new AbortError(ctx.currentStep);
    }
    throw e;
  }
}

/** Yes/no prompt with explicit default. */
export async function confirm(
  ctx: ReleaseContext,
  message: string,
  defaultYes: boolean,
): Promise<boolean> {
  if (!isTty()) return confirmNonTty(message, defaultYes);

  const enquirer = await import("enquirer");
  return runEnquirer(ctx, async () => {
    const answer = await enquirer.default.prompt<{ value: boolean }>({
      type: "confirm",
      name: "value",
      message,
      initial: defaultYes,
    });
    return answer.value;
  });
}

/** Specialised `[y/N]`-style prompt for tight loops (no enquirer overhead). */
export async function askYesNo(
  message: string,
  defaultYes: boolean,
): Promise<boolean> {
  return confirmNonTty(message, defaultYes);
}

async function confirmNonTty(
  message: string,
  defaultYes: boolean,
): Promise<boolean> {
  const suffix = defaultYes ? "[Y/n]" : "[y/N]";
  process.stdout.write(`  ${message} ${suffix} `);
  const raw = await readLine();
  if (raw === "") return defaultYes;
  return /^y(es)?$/i.test(raw);
}

export interface SelectChoice<T extends string> {
  name: T;
  message: string;
  hint?: string;
  disabled?: boolean | string;
}

/**
 * Arrow-key picker on a TTY, numeric readline fallback otherwise.
 * Returns the chosen choice's `name`.
 */
export async function selectOption<T extends string>(
  message: string,
  choices: readonly SelectChoice<T>[],
  options: { initial?: number; ctx?: ReleaseContext } = {},
): Promise<T> {
  if (choices.length === 0) {
    throw new Error("selectOption called with no choices");
  }
  if (choices.length === 1) {
    info(`Only one option: ${choices[0]!.message}`);
    return choices[0]!.name;
  }

  if (!isTty()) return selectOptionNumeric(message, choices);

  const ctx: ReleaseContext = options.ctx ?? makeBareCtx();
  const enquirer = await import("enquirer");
  return runEnquirer(ctx, async () => {
    const answer = await enquirer.default.prompt<{ value: T }>({
      type: "select",
      name: "value",
      message,
      initial: options.initial ?? 0,
      choices: choices.map((c) => ({
        name: c.name,
        message: c.message,
        hint: c.hint,
        disabled: c.disabled,
      })),
      result(name: string) {
        const found = choices.find(
          (c) => c.message === name || c.name === name,
        );
        return (found?.name ?? name) as T;
      },
    });
    return answer.value;
  });
}

async function selectOptionNumeric<T extends string>(
  message: string,
  choices: readonly SelectChoice<T>[],
): Promise<T> {
  info(message);
  let i = 1;
  for (const c of choices) {
    const tag = c.disabled ? chalk.dim(`(disabled)`) : "";
    process.stdout.write(`    ${i}) ${c.message} ${tag}\n`);
    i++;
  }
  for (;;) {
    process.stdout.write(`  > `);
    const line = await readLine();
    const n = Number.parseInt(line, 10);
    if (Number.isInteger(n) && n >= 1 && n <= choices.length) {
      const c = choices[n - 1]!;
      if (c.disabled) {
        info(`Option ${n} is unavailable; pick another.`);
        continue;
      }
      return c.name;
    }
    info(`Pick a number 1-${choices.length}.`);
  }
}

// ---------- three-way prompt for critical actions ------------------------

export type ThreeWayResult = "script" | "manual" | "abort";

/**
 * 1) Script does it / 2) I'll do it manually / 3) Abort.
 * When `requireGh` is true and ctx.hasGh is false, option 1 renders as
 * disabled and option 2 becomes the default — matches the bash graceful
 * degradation.
 */
export async function threeWay(opts: {
  ctx: ReleaseContext;
  scriptLabel: string;
  manualLabel: string;
  requireGh: boolean;
}): Promise<ThreeWayResult> {
  const scriptAvailable = !opts.requireGh || opts.ctx.hasGh;
  const choices: SelectChoice<ThreeWayResult>[] = [
    {
      name: "script",
      message: opts.scriptLabel,
      disabled: scriptAvailable ? false : "unavailable — gh CLI not installed",
    },
    { name: "manual", message: opts.manualLabel },
    { name: "abort", message: "Abort" },
  ];
  return selectOption<ThreeWayResult>(
    "How would you like to proceed?",
    choices,
    {
      ctx: opts.ctx,
      initial: scriptAvailable ? 0 : 1,
    },
  );
}

// ---------- composite helpers --------------------------------------------

/**
 * Announce a state-changing local action, show the command, ask Y/n,
 * then run it. On "no", aborts with --resume-from hint. Used for every
 * non-network state mutation: checkout, pull, merge, branch create,
 * baseline write, commit.
 */
export async function confirmAction(
  ctx: ReleaseContext,
  description: string,
  cmd?: string,
  args: string[] = [],
): Promise<void> {
  // Clear + redraw the banner so each sub-action owns the screen. Without
  // this the screen stacks "Next:" + git output + "Next:" + git output + …
  // and the wizard feel disappears.
  redrawStep(ctx);
  process.stdout.write("\n");
  process.stdout.write(`  ${chalk.bold("Next:")} ${description}\n`);
  if (cmd) {
    process.stdout.write(
      `  ${chalk.dim(`      $ ${[cmd, ...args].join(" ")}`)}\n`,
    );
  }

  const yes = await confirm(ctx, "Proceed?", true);
  if (!yes) {
    info(
      `Use --resume-from=${ctx.currentStep} to re-enter at this step after handling it yourself.`,
    );
    throw new AbortError(ctx.currentStep);
  }

  if (cmd) {
    process.stdout.write("\n");
    await runLocal(cmd, args);
  }
}

export async function pauseForManual(commandToShow: string): Promise<void> {
  process.stdout.write("\n");
  process.stdout.write(`  ${chalk.bold("Run this in another terminal:")}\n\n`);
  process.stdout.write(`      ${commandToShow}\n\n`);
  await waitForEnter("  Press Enter when complete… ");
}

// ---------- raw readline --------------------------------------------------

export async function readLine(): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function waitForEnter(
  prompt = "  Press Enter when done… ",
): Promise<void> {
  process.stdout.write(prompt);
  await readLine();
}

// ---------- internal -----------------------------------------------------

function makeBareCtx(): ReleaseContext {
  return {
    dryRun: false,
    resumeFrom: 0,
    hasGh: false,
    hasClaude: false,
    repoPath: "",
    repoRoot: "",
    currentStep: 0,
  };
}
