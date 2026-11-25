import {
  castResolverTypeErrors,
  migrateSubgraph,
  type ProjectTypeCheck,
  type ProjectTypeError,
  projectTypeErrors,
  resolverCallErrors,
  type ResolverTypeError,
  typeErrorMessage,
  sortedSchemaText,
  type SubgraphMigration,
} from "@powerhousedao/codegen";
import {
  subgraphDirStyles,
  uncachedDefinitionSourceRevision,
  ViteTypeScriptSourceImportAdapter,
} from "@powerhousedao/codegen/utils";
import { projectSubgraphGraphQL } from "document-model";
import { readSubgraphDefinitions } from "document-model/tooling";
import type { DocumentNode } from "graphql";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { outdatedDependency } from "./installed-version.js";
import { definitionChecks } from "./model/check.js";
import { readProjectDefinitions } from "@powerhousedao/codegen/utils";
import {
  assertChangesWritable,
  errorText,
  type FileBackup,
  ignoredByGit,
  restoreChanges,
  writeChanges,
} from "./project-files.js";
import { subgraphReaders } from "./subgraph-readers.js";

/** A module that hangs on a top-level await must not hang `ph migrate`. */
const IMPORT_TIMEOUT_MS = 60_000;
const SCALARS_ENTRY = "scalars/index.ts";
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|graphql)$/;

export type MigrateSubgraphsOptions = {
  readonly projectDir: string;
  /** The `subgraphs/` directories to convert; empty converts every schema-first one. */
  readonly dirs: readonly string[];
  readonly dryRun: boolean;
  /** Leave the resolver calls tsc rejects without a cast. */
  readonly strictResolvers?: boolean;
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
  let outdated = outdatedDependency(projectDir, "@powerhousedao/reactor-api");
  /** The composition errors `ph model check` reported before this run converted anything. */
  let composition: ReadonlySet<string> | undefined;
  /** What the project's tsc reported in the subgraphs before this run wrote anything. */
  let typeBaseline: ProjectTypeCheck | undefined;
  const outsideReaders = subgraphReaders(projectDir);
  const ignored = ignoredByGit(projectDir);
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
      const originals = readDirectory(projectDir, dirName, ignored);
      let written: FileBackup | undefined;
      try {
        const migration = await migrateSubgraph({
          dirName,
          files: new Map(
            [...originals].map(([path, bytes]) => [
              path,
              bytes.toString("utf8"),
            ]),
          ),
          importedFromOutside: outsideReaders.imported,
          readWholeFromOutside: outsideReaders.readWhole,
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
          assertChangesWritable(projectDir, migration.files);
          out(`${label}: would convert ${migration.className} to code-first\n`);
          for (const file of migration.files) out(unifiedDiff(file));
          continue;
        }
        if (outdated !== undefined) {
          out(`${label}: not converted. ${outdated}\n`);
          outdated = "@powerhousedao/reactor-api is too old, as above.";
          failed = true;
          continue;
        }
        // What the host already refuses, read before this run writes anything.
        composition ??= await compositionErrors(projectDir, new Set());
        typeBaseline ??= projectTypeErrors(
          projectDir,
          requested.map((name) => `subgraphs/${name}`),
          [],
        );
        try {
          written = writeChanges(projectDir, migration.files);
        } catch (error) {
          out(
            `${label}: not converted; its files are restored. Writing them failed: ${errorText(error)}\n`,
          );
          failed = true;
          continue;
        }
        let verification = await verify(
          projectDir,
          migration,
          importer,
          revision,
        );
        if (verification.ok) {
          const added = await compositionErrors(projectDir, composition);
          if (added.size > 0) {
            verification = {
              ok: false,
              reason: `The host would not serve the package's code-first subgraphs together:\n${[...added].map((error) => `  ${error}`).join("\n")}\nRename the conflicting types in one of the subgraphs, then migrate again.`,
            };
          }
        }
        if (!verification.ok) {
          restoreChanges(projectDir, written);
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
        for (const note of migration.notes) out(`Note: ${note}\n`);
        if (migration.sdlFile.endsWith("/schema.graphql")) {
          out(
            `${migration.sdlFile} is no longer used; the schema is now in ${label}/schema.ts. It was kept, and you can delete it.\n`,
          );
        }
      } catch (error) {
        if (written !== undefined) restoreChanges(projectDir, written);
        out(
          `${label}: not converted; its files are ${written === undefined ? "unchanged" : "restored"}. The conversion failed unexpectedly: ${errorText(error)}\n`,
        );
        failed = true;
      }
    }
  } finally {
    await importer.disposeRevision();
  }
  if (converted.length > 0) {
    out(
      await typeReport(
        projectDir,
        converted,
        options.strictResolvers ?? false,
        typeBaseline,
      ),
    );
  }
  if (!named && schemaFirst === 0) {
    out("No schema-first subgraphs to convert.\n");
  }
  return failed ? 1 : 0;
}

/**
 * The converted resolvers TypeScript rejects. The schema-first resolver map
 * never checked a resolver's types against the schema; each converted entry
 * calls its resolver with the schema's types, so a disagreement is now a
 * type error. Unless `strict`, each rejected call is cast where it fails, so
 * it runs as before and the project compiles. Any other error the
 * conversion added to the subgraphs, against `baseline`, is reported too.
 */
async function typeReport(
  projectDir: string,
  converted: readonly string[],
  strict: boolean,
  baseline: ProjectTypeCheck | undefined,
): Promise<string> {
  const dirs = converted.map((dirName) => `subgraphs/${dirName}`);
  const indexPaths = dirs.map((dir) => `${dir}/index.ts`);
  const check = () => projectTypeErrors(projectDir, dirs, indexPaths);
  const first = check();
  if (first.kind === "untyped") return "";
  if (first.kind === "skipped") {
    return `Note: the converted resolvers were not type-checked: ${first.reason}.\n`;
  }
  const list = (shown: readonly ResolverTypeError[]) =>
    shown
      .map(
        ({ file, line, coordinate, message }) =>
          `  ${file}:${line} ${coordinate}: ${message}\n`,
      )
      .join("");
  const calls = resolverCallErrors(projectDir, indexPaths, first.errors);
  let report = "";
  let final = first;
  if (calls.length > 0) {
    const count = `${calls.length === 1 ? "1 resolver call disagrees" : `${calls.length} resolver calls disagree`} with the schema the subgraph serves`;
    if (strict) {
      report += `Note: ${count}, so TypeScript rejects ${calls.length === 1 ? "it" : "them"}. The schema-first map never checked them; fix each resolver's types:\n${list(calls)}`;
    } else {
      writeChanges(projectDir, await castResolverTypeErrors(projectDir, calls));
      let after = check();
      if (
        after.kind === "checked" &&
        calls.some(({ message }) =>
          /^Expected (?:\d+-)?\d+ arguments?, but got \d+\./.test(message),
        )
      ) {
        const exposed = resolverCallErrors(
          projectDir,
          indexPaths,
          after.errors,
        );
        if (exposed.length > 0) {
          writeChanges(
            projectDir,
            await castResolverTypeErrors(projectDir, exposed),
          );
          calls.push(...exposed);
          after = check();
        }
      }
      if (after.kind === "checked") final = after;
      const left = resolverCallErrors(projectDir, indexPaths, final.errors);
      report += `Note: ${count}. The schema-first map never checked them; each call is cast where TypeScript rejects it, under a "ph migrate:" comment, so it runs as before and the project compiles. Fix each resolver's types, then remove its cast:\n${list(calls)}`;
      if (left.length > 0) {
        report += `Note: ${left.length === 1 ? "1 resolver call is" : `${left.length} resolver calls are`} still rejected after the casts; fix ${left.length === 1 ? "it" : "them"} by hand:\n${list(left)}`;
      }
    }
  }
  // Errors besides the resolver calls that were not there before.
  if (baseline?.kind === "checked") {
    const key = (error: ProjectTypeError) =>
      `${error.file.split("/").slice(0, 2).join("/")}|${error.lines.join("|")}`;
    const before = new Map<string, number>();
    for (const error of baseline.errors) {
      before.set(key(error), (before.get(key(error)) ?? 0) + 1);
    }
    const inSchema = new Set(
      resolverCallErrors(projectDir, indexPaths, final.errors).map(
        ({ file, line, column }) => `${file}:${line}:${column}`,
      ),
    );
    const introduced = final.errors.filter((error) => {
      if (inSchema.has(`${error.file}:${error.line}:${error.column}`)) {
        return false;
      }
      const remaining = before.get(key(error)) ?? 0;
      if (remaining > 0) {
        before.set(key(error), remaining - 1);
        return false;
      }
      return true;
    });
    if (introduced.length > 0) {
      report += `Note: the conversion added ${introduced.length === 1 ? "1 type error" : `${introduced.length} type errors`} besides the resolver calls. That is a bug in ph migrate; please report it, and fix ${introduced.length === 1 ? "it" : "them"} by hand:\n${introduced
        .map(
          (error) =>
            `  ${error.file}:${error.line}: ${typeErrorMessage(error)}\n`,
        )
        .join("")}`;
    }
  }
  return report;
}

/**
 * The directory's files and `scalars/index.ts`, by project-relative path.
 * Files git ignores, such as build copies, are left out.
 */
function readDirectory(
  projectDir: string,
  dirName: string,
  ignored: (path: string) => boolean,
): ReadonlyMap<string, Buffer> {
  const files = new Map<string, Buffer>();
  const dir = join(projectDir, "subgraphs", dirName);
  for (const entry of readdirSync(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !SOURCE_FILE.test(entry.name)) continue;
    const path = join(entry.parentPath, entry.name);
    const local = path.slice(projectDir.length + 1).replaceAll("\\", "/");
    if (!ignored(local)) files.set(local, readFileSync(path));
  }
  const scalars = join(projectDir, SCALARS_ENTRY);
  if (existsSync(scalars)) files.set(SCALARS_ENTRY, readFileSync(scalars));
  return files;
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

/**
 * The subgraph composition errors `ph model check` reports for the project,
 * leaving out those in `known`. Converted subgraphs are composed with each
 * other: a type two of them declare differently keeps one out of the host.
 */
async function compositionErrors(
  projectDir: string,
  known: ReadonlySet<string>,
): Promise<Set<string>> {
  const report = await readProjectDefinitions(projectDir, (project, modules) =>
    definitionChecks.edit(project, modules),
  );
  return new Set(
    report.diagnostics
      .filter(
        ({ severity, phase }) =>
          severity === "error" && phase === "composition",
      )
      .map(({ message }) => message)
      .filter((message) => !known.has(message)),
  );
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
  readonly after: string | null;
}): string {
  const split = (text: string) =>
    text === "" ? [] : text.replace(/\n$/, "").split("\n");
  const lines = lineEdits(split(file.before ?? ""), split(file.after ?? ""));
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
  const header = `--- ${file.before === null ? "/dev/null" : `a/${file.path}`}\n+++ ${file.after === null ? "/dev/null" : `b/${file.path}`}\n`;
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
