import {
  browserEntry,
  buildBrowserBuildConfig,
  buildNodeBuildConfig,
  findBundledSharedDeps,
} from "@powerhousedao/shared/build-config";
import type { BuiltPiece } from "@powerhousedao/shared/build-pieces";
import {
  assertPiecesOutDir,
  buildPieces,
  expandEntryGlobs,
  pieceListPath,
  planPieces,
  syncDistManifest,
} from "@powerhousedao/shared/build-pieces";
import {
  findSharedImports,
  EXTERNALIZABLE_SHARED_SPECIFIERS,
} from "@powerhousedao/shared/connect";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { detect, resolveCommand } from "package-manager-detector";
import { readPackage } from "read-pkg";
import { build as tsdownBuild } from "tsdown";
import type { BuildArgs } from "../types.js";

/**
 * A Powerhouse package's `powerhouse.manifest.json` "name" must match its
 * `package.json` "name" — Connect and the registry resolve installed versions
 * by treating the manifest name as the npm package name, so a mismatch silently
 * breaks resolution. Fail the build early if they diverge. No-op when the
 * project has no manifest (nothing to compare).
 */
export async function assertManifestNameMatchesPackage(projectPath: string) {
  const manifestPath = join(projectPath, "powerhouse.manifest.json");
  if (!existsSync(manifestPath)) return;

  const { name: packageName } = await readPackage({ cwd: projectPath });

  let manifestName: unknown;
  try {
    manifestName = (
      JSON.parse(readFileSync(manifestPath, "utf-8")) as { name?: unknown }
    ).name;
  } catch {
    throw new Error(
      `Failed to parse "powerhouse.manifest.json" at ${manifestPath}. Make sure it is valid JSON.`,
    );
  }

  if (manifestName !== packageName) {
    throw new Error(
      `Package name mismatch — "package.json" and "powerhouse.manifest.json" must have the same "name":\n` +
        `  package.json             "name": ${JSON.stringify(packageName)}\n` +
        `  powerhouse.manifest.json "name": ${JSON.stringify(manifestName)}\n\n` +
        `Update one so they match, then run the build again.`,
    );
  }
}

export async function runBuild(args: BuildArgs) {
  const { outDir } = args;
  const projectRoot = process.cwd();

  // Fail fast if the manifest name and package.json name have drifted apart.
  await assertManifestNameMatchesPackage(projectRoot);

  const target = {
    projectRoot,
    outDir,
    pieces: planPieces(projectRoot, outDir),
  };
  // Before any bundler runs: an out-dir a host will never read from is worth
  // nothing built, and the failure names what the contract is.
  assertPiecesOutDir(target);
  const sharedDeps = !args.noSharedDeps;

  await tsdownBuild({
    ...buildBrowserBuildConfig({ sharedDeps }),
    outDir: join(outDir, "browser"),
  });

  // Advisory: a shared dep the source imports but the output no longer
  // references as a bare import was inlined despite the external set.
  if (sharedDeps) {
    const imported = findSharedImportsInSources(projectRoot, browserEntry);
    const bundled = findBundledSharedDeps(
      imported,
      readDistBrowserFiles(join(outDir, "browser")),
    );
    if (bundled.length > 0) {
      console.warn(
        `⚠ shared deps bundled instead of externalized: ${bundled.join(", ")} — check your neverBundle config`,
      );
    }
  }

  await tsdownBuild({
    ...buildNodeBuildConfig({ sharedDeps }),
    outDir: join(outDir, "node"),
  });

  // After the node build: it cleans <outDir>/node, where the pieces land. The
  // built list is the gate, so a `bundle:` entry is validated with no piece dir.
  let built: BuiltPiece[] = [];
  if (existsSync(pieceListPath(target))) {
    const pkg = await readPackage({ cwd: projectRoot });
    built = await buildPieces(
      target,
      {
        name: pkg.name,
        version: pkg.version,
        license: typeof pkg.license === "string" ? pkg.license : undefined,
      },
      { bundle: tsdownBuild },
    );
  }
  syncDistManifest(target, built);

  const detectResult = await detect();
  const agent = detectResult?.agent ?? "npm";

  // Emit types with tsc
  const tscCommand = resolveCommand(agent, "execute-local", ["tsc", "--build"]);
  if (tscCommand === null) {
    console.error(
      "You need to have typescript installed to use the `build` command.",
    );
    process.exit(1);
  }
  console.log("\n▶ Emitting types via tsc...");
  try {
    execSync(`${tscCommand.command} ${tscCommand.args.join(" ")}`, {
      stdio: "inherit",
    });
    console.log("✔ Types emitted to", join(outDir, "types"));
  } catch {
    console.warn(
      "✘ tsc reported errors above; declarations were still written. Fix the errors to keep types accurate.",
    );
  }

  const executeLocalCommand = resolveCommand(agent, "execute-local", [
    "tailwindcss",
    "-i",
    "./style.css",
    "-o",
    "./dist/style.css",
  ]);
  if (executeLocalCommand === null) {
    console.error(
      "You need to have tailwindcss installed to use the `build` command.",
    );
    process.exit(1);
  }
  execSync(
    `${executeLocalCommand.command} ${executeLocalCommand.args.join(" ")}`,
  );
}

/**
 * Every shared specifier imported from the entry sources; the post-build
 * scan compares these against the built output.
 *
 * Scoped to the specifiers the build actually externalizes: a specifier the
 * vendor does not publish (the bare `@powerhousedao/shared` root, an
 * unvendored subpath) is deliberately bundled, so reporting it as "bundled
 * instead of externalized" would be a false alarm.
 */
function findSharedImportsInSources(root: string, globs: string[]): string[] {
  const found = new Set<string>();
  for (const file of expandEntryGlobs(root, globs)) {
    const src = readFileSync(file, "utf8");
    for (const spec of findSharedImports(
      src,
      EXTERNALIZABLE_SHARED_SPECIFIERS,
    )) {
      found.add(spec);
    }
  }
  return [...found].sort();
}

/**
 * The built JS outputs of a browser build (entry files and chunks).
 */
function readDistBrowserFiles(
  dir: string,
): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  if (!existsSync(dir)) return out;
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".js")) {
        out.push({ path: p, content: readFileSync(p, "utf8") });
      }
    }
  };
  walk(dir);
  return out;
}
