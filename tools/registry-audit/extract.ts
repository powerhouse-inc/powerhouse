/**
 * Phase 2: extract the downloaded tarballs.
 *
 * Usage:
 *   tsx tools/registry-audit/extract.ts [options]
 *
 * Options:
 *   --filter <substr>   Only extract packages whose name includes <substr> (repeatable)
 *   --force             Re-extract even if already extracted
 *
 * Reads .cache/registry-audit/manifest.json, unpacks each tarball into
 * .cache/registry-audit/extracted/<sanitized-name>/, and records extractedPath.
 */
import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  EXTRACTED_DIR,
  parseArgs,
  requireManifest,
  run,
  sanitize,
  writeManifest,
} from "./lib.js";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2), ["force"]);
  const force = args.flags.force ?? false;
  const filters = args.options.filter ?? [];

  const manifest = await requireManifest(
    "tsx tools/registry-audit/download.ts",
  );

  let entries = Object.values(manifest.packages).filter((e) => e.tarballPath);
  if (filters.length) {
    entries = entries.filter((e) => filters.some((f) => e.name.includes(f)));
  }
  console.log(`Extracting ${entries.length} package(s).\n`);

  let extracted = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of entries) {
    const dest = join(EXTRACTED_DIR, sanitize(entry.name));
    try {
      if (!force && entry.extractedPath === dest && (await exists(dest))) {
        skipped++;
        console.log(`  skip   ${entry.name}@${entry.version}`);
        continue;
      }

      await rm(dest, { recursive: true, force: true });
      await mkdir(dest, { recursive: true });
      // npm tarballs nest everything under a top-level "package/" dir.
      const code = await run(
        "tar",
        ["-xzf", entry.tarballPath!, "-C", dest, "--strip-components=1"],
        { quiet: true },
      );
      if (code !== 0) throw new Error(`tar exited with code ${code}`);

      entry.extractedPath = dest;
      entry.extractedAt = new Date().toISOString();
      entry.error = undefined;
      extracted++;
      console.log(`  ok     ${entry.name}@${entry.version}`);
    } catch (err) {
      failed++;
      entry.error = err instanceof Error ? err.message : String(err);
      console.log(`  FAIL   ${entry.name}: ${entry.error}`);
    }
  }

  await writeManifest(manifest);
  console.log(
    `\nDone. extracted=${extracted} skipped=${skipped} failed=${failed}`,
  );
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
