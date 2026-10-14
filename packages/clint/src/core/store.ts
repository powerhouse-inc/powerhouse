import { readFile, writeFile, rename, mkdir, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import type { WorkdirStore } from "./types.js";

/**
 * Read a JSON file, returning `fallback` on ENOENT.
 */
async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

/**
 * Atomic JSON write: write to temp file, then rename.
 */
async function writeJson(filePath: string, value: unknown): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tmp = join(dir, `.tmp-${randomBytes(6).toString("hex")}`);
  try {
    await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
    await rename(tmp, filePath);
  } catch (err) {
    try {
      await unlink(tmp);
    } catch {}
    throw err;
  }
}

function assertJsonFilename(filename: string): void {
  if (!filename.endsWith(".json")) {
    throw new Error(`Filename must end with .json: ${filename}`);
  }
}

/**
 * Create a file-based WorkdirStore.
 *
 * @param cliWorkdir  Working directory (resolved to absolute via `path.resolve(cwd, cliWorkdir)`).
 * @param cliName     CLI name, used to namespace under `.ph/`.
 */
export function createWorkdirStore(
  cliWorkdir: string,
  cliName: string,
): WorkdirStore {
  const workdir = resolve(process.cwd(), cliWorkdir);
  const storeRoot = join(workdir, ".ph", cliName);
  const localConfigPath = join(workdir, ".ph", `${cliName}.config.local.json`);

  return {
    getWorkdir: () => workdir,
    getLocalConfigPath: () => localConfigPath,
    getStoreFolder: (path?: string) =>
      path ? join(storeRoot, path) : storeRoot,

    async loadJsonObject<T>(filename: string, fallback: T): Promise<T> {
      assertJsonFilename(filename);
      return readJson(join(storeRoot, filename), fallback);
    },

    async storeJsonObject(filename: string, value: unknown): Promise<void> {
      assertJsonFilename(filename);
      return writeJson(join(storeRoot, filename), value);
    },

    async loadLocalConfig<T>(fallback: T): Promise<T> {
      return readJson(localConfigPath, fallback);
    },

    async storeLocalConfig(value: unknown): Promise<void> {
      return writeJson(localConfigPath, value);
    },
  };
}

/**
 * Create an in-memory WorkdirStore for testing or when no persistence is needed.
 *
 * @param cliWorkdir  Working directory (defaults to `'.'`, resolved to absolute).
 * @param cliName     CLI name (defaults to `'test'`).
 */
export function createMemoryWorkdirStore(
  cliWorkdir = ".",
  cliName = "test",
): WorkdirStore {
  const workdir = resolve(process.cwd(), cliWorkdir);
  const storeRoot = join(workdir, ".ph", cliName);
  const localConfigPath = join(workdir, ".ph", `${cliName}.config.local.json`);

  const data = new Map<string, unknown>();

  return {
    getWorkdir: () => workdir,
    getLocalConfigPath: () => localConfigPath,
    getStoreFolder: (path?: string) =>
      path ? join(storeRoot, path) : storeRoot,

    async loadJsonObject<T>(filename: string, fallback: T): Promise<T> {
      assertJsonFilename(filename);
      return data.has(filename) ? (data.get(filename) as T) : fallback;
    },

    async storeJsonObject(filename: string, value: unknown): Promise<void> {
      assertJsonFilename(filename);
      data.set(filename, value);
    },

    async loadLocalConfig<T>(fallback: T): Promise<T> {
      return data.has("__local_config__")
        ? (data.get("__local_config__") as T)
        : fallback;
    },

    async storeLocalConfig(value: unknown): Promise<void> {
      data.set("__local_config__", value);
    },
  };
}
