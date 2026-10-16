import { createHash } from "node:crypto";
import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

const gzipAsync = promisify(gzip);

/** Extensions whose files get `.gz` siblings. */
export const PRECOMPRESS_EXTENSIONS = [".wasm", ".data"] as const;

/** A sibling is written only when it is at most this fraction of the source. */
const MAX_RATIO = 0.9;

export type PrecompressResult = {
  files: number;
  written: number;
  skipped: number;
  inputBytes: number;
  outputBytes: number;
  ms: number;
};

async function findTargets(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter(
      (e) =>
        e.isFile() &&
        PRECOMPRESS_EXTENSIONS.some((ext) => e.name.endsWith(ext)),
    )
    .map((e) => join(e.parentPath, e.name));
}

async function isFresh(source: string, sibling: string): Promise<boolean> {
  try {
    const [s, c] = await Promise.all([stat(source), stat(sibling)]);
    return c.mtimeMs >= s.mtimeMs;
  } catch {
    return false;
  }
}

/** Write gzip siblings for every `.wasm`/`.data` under `dir`. */
export async function precompressAssets(
  dir: string,
): Promise<PrecompressResult> {
  const start = performance.now();
  const targets = await findTargets(dir);
  const result: PrecompressResult = {
    files: targets.length,
    written: 0,
    skipped: 0,
    inputBytes: 0,
    outputBytes: 0,
    ms: 0,
  };
  // Vendor and worker copies share content: compress each distinct file once.
  const byHash = new Map<string, Promise<Buffer | null>>();

  await Promise.all(
    targets.map(async (file) => {
      const sibling = file + ".gz";
      if (await isFresh(file, sibling)) {
        result.skipped += 1;
        return;
      }
      const source = await readFile(file);
      result.inputBytes += source.length;
      const hash = createHash("sha256").update(source).digest("hex");
      let compressed = byHash.get(hash);
      if (!compressed) {
        compressed = gzipAsync(source, { level: 9 }).then((out) =>
          out.length <= source.length * MAX_RATIO ? out : null,
        );
        byHash.set(hash, compressed);
      }
      const out = await compressed;
      if (!out) {
        await rm(sibling, { force: true });
        result.skipped += 1;
        return;
      }
      await writeFile(sibling, out);
      result.written += 1;
      result.outputBytes += out.length;
    }),
  );

  result.ms = Math.round(performance.now() - start);
  return result;
}

/** On by default; PH_CONNECT_PRECOMPRESS=0|false disables it. */
export function isPrecompressEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.PH_CONNECT_PRECOMPRESS ?? "1";
  return raw !== "0" && raw !== "false";
}
