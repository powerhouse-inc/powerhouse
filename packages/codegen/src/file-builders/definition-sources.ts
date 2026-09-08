import { fileExists, type DefinitionSource } from "@powerhousedao/shared/clis";
import { isCanonicalDefinitionSource } from "document-model/tooling";
import { randomUUID } from "node:crypto";
import { open, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { isPlainObject } from "remeda";

export type CodeFirstDefinitionSource = DefinitionSource;

type DefinitionSourceFile = {
  definitionSources?: unknown;
  [key: string]: unknown;
};

function hasOnlyKeys(value: object, allowed: ReadonlySet<string>): boolean {
  return Reflect.ownKeys(value).every(
    (key) => typeof key === "string" && allowed.has(key),
  );
}

function existingEntries(value: unknown): CodeFirstDefinitionSource[] {
  if (value === undefined) return [];
  if (
    isPlainObject(value) &&
    hasOnlyKeys(value, new Set(["formatVersion", "mode"])) &&
    value.formatVersion === 1 &&
    value.mode === "legacy"
  ) {
    return [];
  }
  if (
    isPlainObject(value) &&
    hasOnlyKeys(value, new Set(["formatVersion", "mode", "entries"])) &&
    value.formatVersion === 1 &&
    value.mode === "code-first" &&
    Array.isArray(value.entries) &&
    value.entries.every(isCanonicalDefinitionSource)
  ) {
    return [...value.entries];
  }
  throw new Error(
    "Cannot update an invalid definitionSources configuration. Repair it before generating code-first definitions.",
  );
}

function sameExportPath(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

async function readProjectConfig(
  projectDir: string,
): Promise<{ config: DefinitionSourceFile; path: string }> {
  const path = join(projectDir, "powerhouse.config.json");
  if (!(await fileExists(path))) {
    throw new Error(
      `Cannot register a code-first definition without ${path}. Run ph init first.`,
    );
  }

  let config: unknown;
  try {
    config = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Cannot parse ${path}: ${String(error)}`, {
      cause: error,
    });
  }
  if (!isPlainObject(config)) {
    throw new Error(
      `Cannot update ${path}: the root value must be a JSON object.`,
    );
  }
  return { config: config as DefinitionSourceFile, path };
}

async function replaceFileAtomically(
  path: string,
  contents: string,
): Promise<void> {
  const stagingPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const mode = (await stat(path)).mode;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(stagingPath, "wx", mode);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(stagingPath, path);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(stagingPath, { force: true }).catch(() => undefined);
  }
}

export async function registerCodeFirstDefinitionSource(
  projectDir: string,
  source: CodeFirstDefinitionSource,
): Promise<void> {
  const { config, path } = await readProjectConfig(projectDir);
  if (!isCanonicalDefinitionSource(source)) {
    throw new Error("Cannot register an invalid code-first definition source.");
  }
  const entries = existingEntries(config.definitionSources);

  if (
    !entries.some(
      (entry) =>
        entry.specifier === source.specifier &&
        sameExportPath(entry.exportPath, source.exportPath),
    )
  ) {
    entries.push(source);
  }

  config.definitionSources = {
    formatVersion: 1,
    mode: "code-first",
    entries,
  };
  await replaceFileAtomically(path, `${JSON.stringify(config, null, 2)}\n`);
}

export async function usesCodeFirstDefinitionSources(
  projectDir: string,
): Promise<boolean> {
  const path = join(projectDir, "powerhouse.config.json");
  if (!(await fileExists(path))) return false;
  const config = JSON.parse(
    await readFile(path, "utf8"),
  ) as DefinitionSourceFile;
  if (config.definitionSources === undefined) return false;
  existingEntries(config.definitionSources);
  return (
    isPlainObject(config.definitionSources) &&
    config.definitionSources.mode === "code-first"
  );
}
