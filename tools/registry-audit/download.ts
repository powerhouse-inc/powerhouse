/**
 * Phase 1: download the latest published tarball of every package in the registry.
 *
 * Usage:
 *   tsx tools/registry-audit/download.ts [options]
 *
 * Options:
 *   --registry <url>     Registry base URL (default: $PH_REGISTRY or the dev registry)
 *   --filter <substr>    Only download packages whose name includes <substr> (repeatable)
 *   --concurrency <n>    Parallel downloads (default: 8)
 *   --force              Re-download even if the tarball already exists
 *
 * Writes tarballs to .cache/registry-audit/tarballs/ and records each package in
 * .cache/registry-audit/manifest.json.
 */
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { PackageEntry } from "./lib.js";
import {
  CACHE_DIR,
  download,
  emptyManifest,
  getPackument,
  listPackageNames,
  mapLimit,
  opt,
  parseArgs,
  readManifest,
  resolveLatest,
  resolveRegistry,
  sanitize,
  TARBALLS_DIR,
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
  const registry = resolveRegistry(args);
  const force = args.flags.force ?? false;
  const filters = args.options.filter ?? [];
  const concurrency = Number(opt(args, "concurrency", "8"));

  console.log(`Registry: ${registry}`);
  console.log(`Cache:    ${CACHE_DIR}`);

  let names = await listPackageNames(registry);
  if (filters.length) {
    names = names.filter((n) => filters.some((f) => n.includes(f)));
  }
  console.log(`Found ${names.length} package(s) to process.\n`);

  // Start from the existing manifest so re-runs preserve prior state.
  const existing = await readManifest();
  const manifest =
    existing && existing.registry === registry
      ? existing
      : emptyManifest(registry);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  await mapLimit(names, concurrency, async (name) => {
    const entry: PackageEntry = manifest.packages[name] ?? {
      name,
      version: "",
      tarballUrl: "",
    };
    try {
      const packument = await getPackument(registry, name);
      const { version, tarballUrl } = resolveLatest(packument);
      const tarballPath = join(
        TARBALLS_DIR,
        `${sanitize(name)}-${version}.tgz`,
      );

      entry.version = version;
      entry.tarballUrl = tarballUrl;
      entry.error = undefined;

      if (
        !force &&
        entry.tarballPath === tarballPath &&
        (await exists(tarballPath))
      ) {
        skipped++;
        console.log(`  skip   ${name}@${version}`);
      } else {
        await download(tarballUrl, tarballPath);
        entry.tarballPath = tarballPath;
        entry.downloadedAt = new Date().toISOString();
        // A newer version invalidates any prior extraction.
        entry.extractedPath = undefined;
        entry.extractedAt = undefined;
        downloaded++;
        console.log(`  ok     ${name}@${version}`);
      }
    } catch (err) {
      failed++;
      entry.error = err instanceof Error ? err.message : String(err);
      console.log(`  FAIL   ${name}: ${entry.error}`);
    }
    manifest.packages[name] = entry;
  });

  manifest.generatedAt = new Date().toISOString();
  await writeManifest(manifest);

  console.log(
    `\nDone. downloaded=${downloaded} skipped=${skipped} failed=${failed}`,
  );
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
