import { writeFileEnsuringDir } from "@powerhousedao/shared/clis";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentsTemplate, claudeTemplate } from "templates";

export const AGENTS_BEGIN_MARKER =
  "<!-- powerhouse:begin — ph migrate rewrites this block. Write project notes below the end marker. -->";
export const AGENTS_END_MARKER = "<!-- powerhouse:end -->";
// Fixed prefixes, so a later wording of the begin marker is still found.
const BEGIN_PREFIX = "<!-- powerhouse:begin";
const CLAUDE_IMPORT = "@AGENTS.md";

export const MANAGED_RECORD_PATH = ".agents/powerhouse-managed.json";

/** The files migrate writes agent guidance to, besides skill folders. */
export const MANAGED_AGENT_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  MANAGED_RECORD_PATH,
  ".claude/settings.json",
  ".cursor/cli.json",
  ".gemini/settings.json",
];

export type AgentFileAction =
  | "written"
  | "replaced"
  | "updated"
  | "removed"
  | "left alone"
  | "kept deleted";

export type AgentFileResult = {
  path: string;
  action: AgentFileAction;
  /** What the user should know about the action, e.g. their text was replaced. */
  notice?: string;
};

export const AGENTS_MD_REPLACED_NOTICE =
  "⚠ AGENTS.md had no managed block, so ph migrate replaced the whole file; `git diff AGENTS.md` shows what was there. Copy your own notes below the end marker.";
export const CLAUDE_MD_REPLACED_NOTICE =
  "⚠ CLAUDE.md did not start with @AGENTS.md, so ph migrate replaced the whole file; `git diff CLAUDE.md` shows what was there. Copy your own notes below the @AGENTS.md line.";

export type ManagedRecord = { files: string[]; skills: string[] };

export function readManagedRecord(
  projectDir: string,
): ManagedRecord | undefined {
  const recordPath = join(projectDir, MANAGED_RECORD_PATH);
  if (!existsSync(recordPath)) return undefined;
  try {
    const record = JSON.parse(
      readFileSync(recordPath, "utf-8"),
    ) as Partial<ManagedRecord>;
    return { files: record.files ?? [], skills: record.skills ?? [] };
  } catch {
    console.warn(
      `⚠ ${MANAGED_RECORD_PATH} could not be read; deleted agent files are written again.`,
    );
    return undefined;
  }
}

export async function writeManagedRecord(
  projectDir: string,
  record: ManagedRecord,
) {
  await writeFileEnsuringDir(
    join(projectDir, MANAGED_RECORD_PATH),
    `${JSON.stringify(record, null, 2)}\n`,
  );
}

export const agentsMdBlock = () =>
  `${AGENTS_BEGIN_MARKER}\n${agentsTemplate.trim()}\n\n${AGENTS_END_MARKER}`;

/** A new AGENTS.md: the managed block, then the project's own section. */
export const agentsMdFile = () => `${agentsMdBlock()}\n\n## Project notes\n`;

const hasManagedBlock = (agentsMd: string) => {
  const begin = agentsMd.indexOf(BEGIN_PREFIX);
  return begin !== -1 && agentsMd.indexOf(AGENTS_END_MARKER, begin) !== -1;
};

/** AGENTS.md with its managed block replaced; the whole file when it has no
 * markers, the format before codegen managed it. */
export function managedAgentsMd(existing: string): string {
  if (!hasManagedBlock(existing)) return agentsMdFile();
  const begin = existing.indexOf(BEGIN_PREFIX);
  const end = existing.indexOf(AGENTS_END_MARKER, begin);
  return (
    existing.slice(0, begin) +
    agentsMdBlock() +
    existing.slice(end + AGENTS_END_MARKER.length)
  );
}

/** CLAUDE.md as the import form; undefined when it already starts with it. */
export function managedClaudeMd(existing: string): string | undefined {
  const firstLine = existing.trimStart().split("\n", 1)[0]?.trim();
  return firstLine === CLAUDE_IMPORT ? undefined : claudeTemplate.trimStart();
}

/** AGENTS.md and CLAUDE.md; a file the record lists but the project lacks was
 * deleted by the user and stays deleted. */
export async function writeAgentInstructionFiles(
  projectDir: string,
): Promise<AgentFileResult[]> {
  const record = readManagedRecord(projectDir);
  // Path, update, new file, and the notice for an update that replaces it whole.
  const files: [
    string,
    (existing: string) => string | undefined,
    string,
    (existing: string) => string | undefined,
  ][] = [
    [
      "AGENTS.md",
      managedAgentsMd,
      agentsMdFile(),
      (existing) =>
        hasManagedBlock(existing) ? undefined : AGENTS_MD_REPLACED_NOTICE,
    ],
    [
      "CLAUDE.md",
      managedClaudeMd,
      claudeTemplate.trimStart(),
      () => CLAUDE_MD_REPLACED_NOTICE,
    ],
  ];
  const results: AgentFileResult[] = [];
  for (const [path, update, fresh, wholeFileNotice] of files) {
    const filePath = join(projectDir, path);
    if (!existsSync(filePath)) {
      if (record?.files.includes(path)) {
        results.push({ path, action: "kept deleted" });
        continue;
      }
      await writeFileEnsuringDir(filePath, fresh);
      results.push({ path, action: "written" });
      continue;
    }
    const existing = readFileSync(filePath, "utf-8");
    const contents = update(existing);
    if (contents === undefined || contents === existing) {
      results.push({ path, action: "left alone" });
      continue;
    }
    await writeFileEnsuringDir(filePath, contents);
    const notice = wholeFileNotice(existing);
    results.push({ path, action: "replaced", ...(notice && { notice }) });
  }
  const written = new Set([
    ...(record?.files ?? []),
    ...files.map(([path]) => path),
  ]);
  await writeManagedRecord(projectDir, {
    files: [...written],
    skills: record?.skills ?? [],
  });
  return results;
}

/** The managed agent paths with uncommitted changes; undefined outside a git
 * work tree. */
export function uncommittedAgentFiles(
  projectDir: string,
  paths: readonly string[] = MANAGED_AGENT_FILES,
): string[] | undefined {
  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd: projectDir,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  try {
    if (git(["rev-parse", "--is-inside-work-tree"]).trim() !== "true") {
      return undefined;
    }
  } catch {
    return undefined;
  }
  const status = git([
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    ...paths,
  ]);
  return status
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3));
}

/** The managed agent paths git ignores. */
export function ignoredAgentFiles(
  projectDir: string,
  paths: readonly string[],
): string[] {
  try {
    return execFileSync("git", ["check-ignore", "--", ...paths], {
      cwd: projectDir,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    // Exit code 1: none is ignored.
    return [];
  }
}

/** Stops a migrate that would replace uncommitted agent files. */
export function assertAgentFilesCommitted(
  projectDir: string,
  paths: readonly string[],
) {
  const uncommitted = uncommittedAgentFiles(projectDir, paths);
  if (uncommitted === undefined) {
    console.warn(
      "⚠ Not a git repository: ph migrate replaces agent guidance files and can't show what it replaced.",
    );
    return;
  }
  const ignored = ignoredAgentFiles(projectDir, paths);
  if (ignored.length > 0) {
    console.warn(
      `⚠ git ignores ${ignored.join(", ")}: teammates don't get them, and ph migrate can't show what it replaces there.`,
    );
  }
  if (uncommitted.length === 0) return;
  throw new Error(
    [
      "ph migrate replaces these agent files, which have uncommitted changes:",
      ...uncommitted.map((path) => `  ${path}`),
      "Commit or stash them, then run ph migrate again.",
    ].join("\n"),
  );
}
