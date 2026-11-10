import {
  migrateSubgraph,
  sortedSchemaText,
  type SubgraphMigration,
  type SubgraphMigrationFile,
} from "@powerhousedao/codegen";
import {
  subgraphDirStyles,
  uncachedDefinitionSourceRevision,
  ViteTypeScriptSourceImportAdapter,
} from "@powerhousedao/codegen/utils";
import { projectSubgraphGraphQL } from "document-model";
import { readSubgraphDefinitions } from "document-model/tooling";
import type { DocumentNode } from "graphql";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/** A module that hangs on a top-level await must not hang `ph migrate`. */
const IMPORT_TIMEOUT_MS = 60_000;
const SCALARS_ENTRY = "scalars/index.ts";
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|graphql)$/;

export type MigrateSubgraphsOptions = {
  readonly projectDir: string;
  /** The `subgraphs/` directories to convert; empty converts every schema-first one. */
  readonly dirs: readonly string[];
  readonly dryRun: boolean;
  readonly out?: (text: string) => void;
};

type Verification =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/**
 * `ph migrate --subgraphs`: converts schema-first subgraphs into code-first
 * ones. Each written directory is loaded as `ph model check` loads it and
 * must serve the schema it served before; otherwise its files are restored.
 * Without named directories, a directory whose `index.ts` holds no class is
 * skipped. Returns the exit code: 0 when every requested subgraph converted
 * or was already code-first, 1 otherwise.
 */
export async function migrateSubgraphs(
  options: MigrateSubgraphsOptions,
): Promise<0 | 1> {
  const out =
    options.out ?? ((text: string) => void process.stdout.write(text));
  const { projectDir, dryRun } = options;
  const styles = new Map(
    subgraphDirStyles(join(projectDir, "subgraphs")).map(
      ({ dirName, style }) => [dirName, style] as const,
    ),
  );
  let failed = false;
  let schemaFirst = 0;
  const named = options.dirs.length > 0;
  const requested = named ? options.dirs : [...styles.keys()];
  const converted: string[] = [];
  const importer = new ViteTypeScriptSourceImportAdapter();
  const revision = uncachedDefinitionSourceRevision();
  try {
    for (const dirName of requested) {
      const label = `subgraphs/${dirName}`;
      const style = styles.get(dirName);
      if (style === undefined) {
        out(
          `${label}: not found. Name a directory of subgraphs/ that has an index.ts.\n`,
        );
        failed = true;
        continue;
      }
      if (style === "code-first") {
        out(`${label}: already code-first\n`);
        continue;
      }
      const originals = readDirectory(projectDir, dirName);
      const migration = await migrateSubgraph({
        dirName,
        files: new Map(
          [...originals].map(([path, bytes]) => [path, bytes.toString("utf8")]),
        ),
      });
      if (migration.kind === "no-subgraph-class" && !named) {
        out(`${label}: no subgraph class, skipped\n`);
        continue;
      }
      schemaFirst++;
      if (migration.kind !== "converted") {
        out(refusalText(label, migration));
        failed = true;
        continue;
      }
      if (dryRun) {
        out(`${label}: would convert ${migration.className} to code-first\n`);
        for (const file of migration.files) out(unifiedDiff(file));
        continue;
      }
      writeFiles(projectDir, migration.files);
      const verification = await verify(
        projectDir,
        migration,
        importer,
        revision,
      );
      if (!verification.ok) {
        restoreFiles(projectDir, migration.files, originals);
        out(
          `${label}: not converted; its files are restored. ${verification.reason}\n`,
        );
        failed = true;
        continue;
      }
      converted.push(dirName);
      out(
        `${label}: converted ${migration.className} to code-first; it serves the same schema\n`,
      );
      if (migration.sdlFile.endsWith("/schema.graphql")) {
        out(
          `${migration.sdlFile} is no longer used; the schema is now in ${label}/schema.ts. It was kept, and you can delete it.\n`,
        );
      }
    }
  } finally {
    await importer.disposeRevision();
  }
  if (!named && schemaFirst === 0) {
    out("No schema-first subgraphs to convert.\n");
  }
  return failed ? 1 : 0;
}

/** The directory's files and `scalars/index.ts`, by project-relative path. */
function readDirectory(
  projectDir: string,
  dirName: string,
): ReadonlyMap<string, Buffer> {
  const files = new Map<string, Buffer>();
  const dir = join(projectDir, "subgraphs", dirName);
  for (const entry of readdirSync(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !SOURCE_FILE.test(entry.name)) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(
      path.slice(projectDir.length + 1).replaceAll("\\", "/"),
      readFileSync(path),
    );
  }
  const scalars = join(projectDir, SCALARS_ENTRY);
  if (existsSync(scalars)) files.set(SCALARS_ENTRY, readFileSync(scalars));
  return files;
}

function writeFiles(
  projectDir: string,
  files: readonly SubgraphMigrationFile[],
) {
  for (const file of files)
    writeFileSync(join(projectDir, file.path), file.after);
}

function restoreFiles(
  projectDir: string,
  files: readonly SubgraphMigrationFile[],
  originals: ReadonlyMap<string, Buffer>,
) {
  for (const file of files) {
    const original = originals.get(file.path);
    if (original === undefined)
      rmSync(join(projectDir, file.path), { force: true });
    else writeFileSync(join(projectDir, file.path), original);
  }
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `it did not finish loading within ${timeoutMs / 1000} seconds`,
          ),
        ),
      timeoutMs,
    );
    timer.unref();
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Loads the written class without constructing it and compares the schema it serves. */
async function verify(
  projectDir: string,
  migration: Extract<SubgraphMigration, { kind: "converted" }>,
  importer: ViteTypeScriptSourceImportAdapter,
  revision: ReturnType<typeof uncachedDefinitionSourceRevision>,
): Promise<Verification> {
  const specifier = `./subgraphs/${migration.dirName}/index.ts` as const;
  let namespace: Readonly<Record<string, unknown>>;
  try {
    namespace = await withTimeout(
      importer.importModule({
        packageRoot: projectDir,
        specifier,
        packageRevision: revision,
      }),
      IMPORT_TIMEOUT_MS,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `The converted module does not load: ${message.replaceAll(projectDir, ".")}`,
    };
  }
  const { subgraphs, diagnostics } = readSubgraphDefinitions(namespace, {
    specifier,
  });
  const errors = diagnostics.filter(({ severity }) => severity === "error");
  if (errors.length > 0) {
    return {
      ok: false,
      reason: `The converted subgraph does not compile:\n${errors.map(({ message, repair }) => `  ${message} ${repair}`).join("\n")}`,
    };
  }
  const subgraph = subgraphs.find(
    ({ name }) => name === migration.subgraphName,
  );
  if (subgraph === undefined) {
    return {
      ok: false,
      reason: `${specifier} exports no code-first subgraph named ${migration.subgraphName}.`,
    };
  }
  const served = sortedSchemaText(
    projectSubgraphGraphQL(subgraph.definition) as unknown as DocumentNode,
  );
  if (served === migration.sdl) return { ok: true };
  return {
    ok: false,
    reason: `The converted subgraph serves a different schema:\n${unifiedDiff({
      path: "schema",
      before: migration.sdl,
      after: served,
    })}`,
  };
}

function refusalText(
  label: string,
  migration: Extract<
    SubgraphMigration,
    { kind: "refused" | "no-subgraph-class" }
  >,
): string {
  return `${label}: not converted\n${migration.refusals
    .map(
      ({ file, line, reason, repair }) =>
        `  ${file}:${line}: ${reason}\n    ${repair}\n`,
    )
    .join("")}`;
}

type Line = { readonly kind: " " | "-" | "+"; readonly text: string };

/** The line edits from `before` to `after`, by longest common subsequence. */
function lineEdits(
  before: readonly string[],
  after: readonly string[],
): Line[] {
  const common: number[][] = Array.from({ length: before.length + 1 }, () =>
    new Array<number>(after.length + 1).fill(0),
  );
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      common[i][j] =
        before[i] === after[j]
          ? common[i + 1][j + 1] + 1
          : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  const lines: Line[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      lines.push({ kind: " ", text: before[i++] });
      j++;
    } else if (
      i < before.length &&
      (j === after.length || common[i + 1][j] >= common[i][j + 1])
    ) {
      lines.push({ kind: "-", text: before[i++] });
    } else {
      lines.push({ kind: "+", text: after[j++] });
    }
  }
  return lines;
}

const CONTEXT = 3;

/** A unified diff of one file; a new file diffs against /dev/null. */
export function unifiedDiff(file: {
  readonly path: string;
  readonly before: string | null;
  readonly after: string;
}): string {
  const split = (text: string) =>
    text === "" ? [] : text.replace(/\n$/, "").split("\n");
  const lines = lineEdits(split(file.before ?? ""), split(file.after));
  const changed = lines.flatMap((line, index) =>
    line.kind === " " ? [] : [index],
  );
  if (changed.length === 0) return "";
  const hunks: [number, number][] = [];
  for (const index of changed) {
    const start = Math.max(0, index - CONTEXT);
    const end = Math.min(lines.length, index + CONTEXT + 1);
    const last = hunks.at(-1);
    if (last !== undefined && start <= last[1]) last[1] = end;
    else hunks.push([start, end]);
  }
  const header = `--- ${file.before === null ? "/dev/null" : `a/${file.path}`}\n+++ b/${file.path}\n`;
  return (
    header +
    hunks
      .map(([start, end]) => {
        const lineBefore = (kind: Line["kind"]) =>
          lines.slice(0, start).filter((line) => line.kind !== kind).length;
        const slice = lines.slice(start, end);
        const count = (kind: Line["kind"]) =>
          slice.filter((line) => line.kind !== kind).length;
        const oldCount = count("+");
        const newCount = count("-");
        const oldStart = oldCount === 0 ? lineBefore("+") : lineBefore("+") + 1;
        const newStart = newCount === 0 ? lineBefore("-") : lineBefore("-") + 1;
        return `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n${slice
          .map((line) => `${line.kind}${line.text}`)
          .join("\n")}\n`;
      })
      .join("")
  );
}
