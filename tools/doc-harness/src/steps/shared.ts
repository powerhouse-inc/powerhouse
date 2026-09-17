/** What every taskRun step needs: its input schema, the layout, file helpers. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z, type ZodType } from "zod";
import type { Task } from "../lib/catalog.js";
import type { ClaudeDriver, ClaudeInvocation } from "../lib/claude-driver.js";
import {
  getHarnessContext,
  taskOf,
  type HarnessContext,
} from "../lib/context.js";
import { runLayout, type AttemptLayout, type RunLayout } from "../lib/paths.js";
import { Arm, RunArgs, type ClaudeOutcome } from "../lib/schemas.js";

export const TaskRunInput = z.object({
  runId: z.string(),
  taskId: z.string(),
  arm: Arm,
  n: z.number().int().positive(),
  docsDir: z.string(),
  docsSha: z.string(),
  pin: z.string(),
  cliVersion: z.string(),
  args: RunArgs,
});
export type TaskRunInput = z.infer<typeof TaskRunInput>;

export interface AttemptScope {
  input: TaskRunInput;
  ctx: HarnessContext;
  task: Task;
  run: RunLayout;
  layout: AttemptLayout;
}

export function attemptScope(input: TaskRunInput): AttemptScope {
  const ctx = getHarnessContext(input.runId);
  const run = runLayout(input.runId, ctx.runsRoot);
  return {
    input,
    ctx,
    task: taskOf(ctx, input.taskId),
    run,
    layout: run.attempt(input.taskId, input.arm, input.n),
  };
}

export function readJson<T>(file: string, schema: ZodType<T>): T {
  return schema.parse(JSON.parse(readFileSync(file, "utf8")));
}

/** The step's output file, when a previous drive already wrote it. */
export function readCached<T>(file: string, schema: ZodType<T>): T | null {
  return existsSync(file) ? readJson(file, schema) : null;
}

export function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** Every claude process goes through the run-wide semaphore. */
export function callClaude(
  ctx: HarnessContext,
  driver: ClaudeDriver,
  inv: ClaudeInvocation,
): Promise<ClaudeOutcome> {
  return ctx.semaphore.with(() => driver.run(inv));
}

export function attemptLabel(
  input: Pick<TaskRunInput, "taskId" | "arm" | "n">,
) {
  return `${input.taskId} ${input.arm}#${input.n}`;
}
