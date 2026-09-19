/**
 * Prompt templates for the three claude -p roles. Templates are Markdown
 * under prompts/ with {{name}} placeholders; the build* functions supply
 * every placeholder from typed inputs.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Task } from "./catalog.js";
import { PROMPTS_ROOT } from "./paths.js";
import type { Arm, Finding } from "./schemas.js";

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

export type PromptPair = { system: string; task: string };

/** Placeholder names in a template, in order of first appearance, deduped. */
export function placeholders(template: string): string[] {
  const names: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/** Substitutes {{name}}; throws when a placeholder has no value. */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  const missing = placeholders(template).filter((name) => !(name in vars));
  if (missing.length > 0) {
    throw new Error(`prompt is missing values for: ${missing.join(", ")}`);
  }
  return template.replace(PLACEHOLDER, (_all, name: string) => vars[name]);
}

/** Reads prompts/<name>.md. */
export function loadPrompt(name: string, root: string = PROMPTS_ROOT): string {
  return readFileSync(path.join(root, `${name}.md`), "utf8");
}

/** Loads prompts/<file>.md and renders it. */
export function renderPrompt(
  file: string,
  vars: Record<string, string>,
  root: string = PROMPTS_ROOT,
): string {
  return renderTemplate(loadPrompt(file, root), vars);
}

/* ------------------------------------------------------------- builder */

export type TaskPromptInput = Pick<Task, "title" | "taskPrompt" | "contract">;

export interface BuilderPromptVars {
  docsDir: string;
  pin: string;
  workspaceDir: string;
  arm: Arm;
  /** Required for arm B. */
  referenceDir?: string;
}

export function renderContract(contract: Task["contract"]): string {
  if (contract.length === 0) return "- (no files are imported by tests)";
  return contract
    .map((entry) => {
      const names = entry.exports.map((name) => `\`${name}\``).join(", ");
      return entry.exports.length === 0
        ? `- \`${entry.file}\``
        : `- \`${entry.file}\` exports ${names}`;
    })
    .join("\n");
}

function referenceSection(
  file: string,
  arm: Arm,
  referenceDir: string | undefined,
  root: string,
): string {
  if (arm !== "B") return "";
  if (!referenceDir) throw new Error("arm B needs referenceDir");
  return renderPrompt(file, { referenceDir }, root);
}

export function buildBuilderPrompts(
  task: TaskPromptInput,
  vars: BuilderPromptVars,
  root: string = PROMPTS_ROOT,
): PromptPair {
  return {
    system: renderPrompt(
      "builder.system",
      {
        docsDir: vars.docsDir,
        pin: vars.pin,
        workspaceDir: vars.workspaceDir,
        referenceSection: referenceSection(
          "builder.reference",
          vars.arm,
          vars.referenceDir,
          root,
        ),
      },
      root,
    ),
    task: renderPrompt(
      "builder.task",
      {
        taskTitle: task.title,
        taskPrompt: task.taskPrompt,
        contract: renderContract(task.contract),
      },
      root,
    ),
  };
}

/* --------------------------------------------------------------- judge */

export interface JudgePromptVars {
  taskId: string;
  arm: Arm;
  pin: string;
  docsDir: string;
  docsIndex: string;
  dtsDir: string;
  metricsPath: string;
  compactPath: string;
  testsPath: string;
  /** Required for arm B. */
  referenceDir?: string;
}

export function buildJudgePrompt(
  task: TaskPromptInput,
  vars: JudgePromptVars,
  root: string = PROMPTS_ROOT,
): PromptPair {
  return {
    system: renderPrompt(
      "judge.system",
      {
        taskId: vars.taskId,
        arm: vars.arm,
        pin: vars.pin,
        docsDir: vars.docsDir,
        docsIndex: vars.docsIndex,
        dtsDir: vars.dtsDir,
        metricsPath: vars.metricsPath,
        compactPath: vars.compactPath,
        testsPath: vars.testsPath,
        referenceSection: referenceSection(
          "judge.reference",
          vars.arm,
          vars.referenceDir,
          root,
        ),
      },
      root,
    ),
    task: renderPrompt(
      "judge.task",
      {
        taskId: vars.taskId,
        arm: vars.arm,
        taskTitle: task.title,
        taskPrompt: task.taskPrompt,
        contract: renderContract(task.contract),
      },
      root,
    ),
  };
}

/* ------------------------------------------------------------ verifier */

export interface IndexedFinding {
  /** Index into JudgeStepResult.kept; echoed back as VerifyResult.index. */
  index: number;
  finding: Finding;
}

export interface VerifierPromptVars {
  taskId: string;
  arm: Arm;
  pin: string;
  workspaceDir: string;
  docsDir: string;
  compactPath: string;
  findings: IndexedFinding[];
}

export function renderFindings(findings: IndexedFinding[]): string {
  if (findings.length === 0) return "(no findings)";
  return findings
    .map(({ index, finding }) => {
      const where =
        finding.docPath === null
          ? "docPath: (none)"
          : `docPath: \`${finding.docPath}\`${finding.line === null ? "" : ` line ${finding.line}`}`;
      const quote =
        finding.quote === null
          ? ""
          : `\n  quote: ${JSON.stringify(finding.quote)}`;
      const turns = finding.evidence.map((e) => e.turn).join(", ");
      return [
        `### ${index}: ${finding.kind} \`${finding.symbol}\``,
        `- ${where}${quote}`,
        `- claim: ${finding.claim}`,
        `- evidence turns: ${turns.length > 0 ? turns : "(none)"}`,
        `- confidence: ${finding.confidence}`,
      ].join("\n");
    })
    .join("\n\n");
}

export function buildVerifierPrompt(
  vars: VerifierPromptVars,
  root: string = PROMPTS_ROOT,
): PromptPair {
  return {
    system: renderPrompt(
      "verifier.system",
      {
        pin: vars.pin,
        workspaceDir: vars.workspaceDir,
        docsDir: vars.docsDir,
        compactPath: vars.compactPath,
      },
      root,
    ),
    task: renderPrompt(
      "verifier.task",
      {
        taskId: vars.taskId,
        arm: vars.arm,
        findings: renderFindings(vars.findings),
      },
      root,
    ),
  };
}
