/** Per-invocation `--settings` JSON for the builder, judge and verifier. */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import type { Arm, SandboxMode } from "./schemas.js";

export interface PermissionSettings {
  permissions: {
    defaultMode: "dontAsk" | "bypassPermissions";
    allow: string[];
    deny: string[];
  };
  sandbox: {
    enabled: true;
    autoAllowBashIfSandboxed: false;
    /** The sandbox is the boundary, not a suggestion: no per-command opt-out. */
    allowUnsandboxedCommands: false;
    filesystem: { denyRead: string[] };
    network: { allowedDomains: []; allowUnixSockets: string[] };
  };
}

const NON_FILE_TOOLS_DENIED = [
  "WebFetch",
  "WebSearch",
  "Agent",
  "Skill",
  "Task",
];

/** Claude Code spells an absolute-path rule as `//` + path. */
export function pathRule(tool: string, absDir: string): string {
  const abs = path.resolve(absDir).replace(/^\/+/, "");
  return `${tool}(//${abs}/**)`;
}

function claudeDir(): string {
  return path.join(homedir(), ".claude");
}

/** tsx's IPC socket dir; sandboxed TMPDIR is `/tmp/claude-<uid>`, not ours. */
export function tsxSocketDirs(): string[] {
  const uid = process.getuid?.();
  if (uid === undefined) return [];
  const roots = [tmpdir(), `/tmp/claude-${uid}`, `/private/tmp/claude-${uid}`];
  const dirs = roots.map((root) => path.join(root, `tsx-${uid}`));
  return [...new Set(dirs)];
}

function sandboxBlock(denyRead: string[]): PermissionSettings["sandbox"] {
  return {
    enabled: true,
    autoAllowBashIfSandboxed: false,
    allowUnsandboxedCommands: false,
    filesystem: { denyRead: denyRead.map((p) => path.resolve(p)) },
    network: { allowedDomains: [], allowUnixSockets: tsxSocketDirs() },
  };
}

export interface BuilderSettingsOptions {
  workspaceDir: string;
  docsDir: string;
  /** Monorepo, recipes checkout: anything the builder must not read. */
  deniedRoots: string[];
  arm: Arm;
  /** Arm B reads it; arm A has it denied so the layout stays identical. */
  referenceDir: string;
  sandbox: SandboxMode;
}

export function builderSettings(o: BuilderSettingsOptions): PermissionSettings {
  const home = claudeDir();
  const deny = [
    ...o.deniedRoots.map((root) => pathRule("Read", root)),
    pathRule("Read", home),
    ...(o.arm === "A" ? [pathRule("Read", o.referenceDir)] : []),
    ...NON_FILE_TOOLS_DENIED,
  ];
  return {
    permissions: {
      defaultMode: o.sandbox === "bypass" ? "bypassPermissions" : "dontAsk",
      allow: [
        pathRule("Read", o.workspaceDir),
        pathRule("Edit", o.workspaceDir),
        pathRule("Write", o.workspaceDir),
        pathRule("Read", o.docsDir),
        "Glob(*)",
        "Grep(*)",
        "Bash(*)",
      ],
      deny,
    },
    sandbox: sandboxBlock([...o.deniedRoots, home]),
  };
}

export interface JudgeSettingsOptions {
  attemptDir: string;
  docsDir: string;
  dtsDir: string;
}

const WRITE_TOOLS_DENIED = ["Edit", "Write", "NotebookEdit"];

export function judgeSettings(o: JudgeSettingsOptions): PermissionSettings {
  return {
    permissions: {
      defaultMode: "dontAsk",
      allow: [
        pathRule("Read", o.attemptDir),
        pathRule("Read", o.docsDir),
        pathRule("Read", o.dtsDir),
        "Glob(*)",
        "Grep(*)",
      ],
      deny: ["Bash", ...WRITE_TOOLS_DENIED, ...NON_FILE_TOOLS_DENIED],
    },
    sandbox: sandboxBlock([]),
  };
}

export interface VerifierSettingsOptions {
  workspaceDir: string;
  docsDir: string;
  deniedRoots: string[];
}

export function verifierSettings(
  o: VerifierSettingsOptions,
): PermissionSettings {
  const home = claudeDir();
  return {
    permissions: {
      defaultMode: "dontAsk",
      // The verifier writes probe snippets under workspace/__verify__/.
      allow: [
        pathRule("Read", o.workspaceDir),
        pathRule("Edit", o.workspaceDir),
        pathRule("Write", o.workspaceDir),
        pathRule("Read", o.docsDir),
        "Glob(*)",
        "Grep(*)",
        "Bash(*)",
      ],
      deny: [
        ...o.deniedRoots.map((root) => pathRule("Read", root)),
        pathRule("Read", home),
        ...NON_FILE_TOOLS_DENIED,
      ],
    },
    sandbox: sandboxBlock([...o.deniedRoots, home]),
  };
}

export function writeSettings(file: string, settings: object): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
}
