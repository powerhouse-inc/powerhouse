/**
 * Run every recipe's build / test / start script against the Powerhouse
 * packages in *this* checkout instead of the published versions its
 * `catalog:` pins.
 *
 * The recipes repo resolves `@powerhousedao/*`, `document-model` and
 * `@renown/sdk` from npm at a pinned dev version, so on its own it never
 * exercises local code. This runner mirrors the recipes tree into a scratch
 * directory, rewrites those specifiers to `link:` paths pointing at the
 * monorepo's package directories, installs, and then runs each recipe's
 * scripts with a per-script timeout.
 *
 * `link:` is a symlink, not a packed tarball: a file missing from a package's
 * `files` allowlist is still visible through it. This runner therefore does
 * not catch packaging regressions — see test/package-e2e for the local-registry
 * flow that does.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run, type RunResult, type Status } from "./lib/runner.js";
import {
  findWorkspacePackages,
  parseNonExitingStarts,
  type PackageInfo,
} from "./lib/workspace.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MONOREPO = path.resolve(ROOT, "../..");

const PHASES = ["build", "test", "start"] as const;
type Phase = (typeof PHASES)[number];

interface Options {
  recipesDir: string;
  workDir: string;
  inPlace: boolean;
  phases: Phase[];
  filters: string[];
  skips: string[];
  timeoutMs: number;
  install: boolean;
  keep: boolean;
  verbose: boolean;
  list: boolean;
}

function parseArgs(argv: string[]): Options {
  const next = (i: number, flag: string): string => {
    if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) {
      fail(`${flag} requires a value`);
    }
    return argv[i + 1];
  };

  const options: Options = {
    recipesDir: process.env.RECIPES_DIR
      ? path.resolve(process.env.RECIPES_DIR)
      : path.resolve(MONOREPO, "../recipes"),
    workDir: path.join(os.tmpdir(), "ph-recipes-e2e"),
    inPlace: false,
    phases: [...PHASES],
    filters: [],
    skips: [],
    timeoutMs: 300_000,
    install: true,
    keep: false,
    verbose: false,
    list: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--recipes-dir":
        options.recipesDir = path.resolve(next(i, arg));
        i++;
        break;
      case "--work-dir":
        options.workDir = path.resolve(next(i, arg));
        i++;
        break;
      case "--in-place":
        options.inPlace = true;
        break;
      case "--only": {
        const requested = next(i, arg)
          .split(",")
          .map((s) => s.trim());
        for (const phase of requested) {
          if (!PHASES.includes(phase as Phase)) {
            fail(`unknown phase "${phase}" (expected ${PHASES.join("|")})`);
          }
        }
        options.phases = requested as Phase[];
        i++;
        break;
      }
      case "--filter":
        options.filters.push(next(i, arg));
        i++;
        break;
      case "--skip":
        options.skips.push(next(i, arg));
        i++;
        break;
      case "--timeout":
        options.timeoutMs = Number(next(i, arg)) * 1000;
        i++;
        break;
      case "--no-install":
        options.install = false;
        break;
      case "--keep":
        options.keep = true;
        break;
      case "--verbose":
        options.verbose = true;
        break;
      case "--list":
        options.list = true;
        break;
      case "--help":
        usage();
        process.exit(0);
        break;
      default:
        fail(`unknown argument "${arg}" (try --help)`);
    }
  }

  if (options.inPlace) options.workDir = options.recipesDir;
  return options;
}

function usage(): void {
  console.log(`
Usage: pnpm test:e2e:recipes [options]

  --recipes-dir <path>  Recipes checkout (default: $RECIPES_DIR or ../recipes)
  --work-dir <path>     Scratch copy location (default: $TMPDIR/ph-recipes-e2e)
  --in-place            Operate on the recipes checkout itself. Mutates its
                        package.json files and lockfile; restored on exit.
  --only <phases>       Comma list of build,test,start (default: all)
  --filter <substr>     Only recipes whose directory or package name matches.
                        Repeatable.
  --skip <substr>       Exclude matching recipes. Repeatable.
  --timeout <seconds>   Per-script timeout (default: 300)
  --no-install          Reuse the work dir's existing node_modules
  --keep                Leave the scratch copy in place for inspection
  --verbose             Stream each script's output live
  --list                Print the resolved plan and exit
`);
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(2);
}

function step(title: string): void {
  console.log(`\n━━━ ${title} ━━━`);
}

/* ------------------------------------------------------------------ linking */

/**
 * Map each Powerhouse package name the recipes depend on to its directory in
 * this checkout. Derived by intersecting the two workspaces rather than from a
 * hardcoded list, so a renamed or relocated package is picked up automatically
 * and a genuinely-external dependency is left on its published version.
 */
function buildLinkMap(
  monorepoPackages: PackageInfo[],
  recipes: PackageInfo[],
): Map<string, string> {
  const byName = new Map(monorepoPackages.map((p) => [p.name, p.dir]));
  const linkMap = new Map<string, string>();

  for (const recipe of recipes) {
    const specs = { ...recipe.dependencies, ...recipe.devDependencies };
    for (const name of Object.keys(specs)) {
      const dir = byName.get(name);
      if (dir !== undefined) linkMap.set(name, dir);
    }
  }
  return linkMap;
}

/**
 * `link:` resolves through the target's `exports` map, and every Powerhouse
 * package points its `import`/`types` conditions at `dist/`. An unbuilt
 * checkout therefore fails with a bare module-not-found from inside the recipe,
 * which reads like a recipe bug. Check up front and say what to run instead.
 */
function assertBuilt(linkMap: Map<string, string>): void {
  const unbuilt = [...linkMap]
    .filter(([, dir]) => !fs.existsSync(path.join(dir, "dist")))
    .map(([name]) => name);

  if (unbuilt.length > 0) {
    fail(
      `these linked packages have no dist/ — run \`pnpm build\` in ${MONOREPO} first:\n` +
        unbuilt.map((n) => `  ${n}`).join("\n"),
    );
  }
}

/* ------------------------------------------------------------------ work dir */

const COPY_EXCLUDES = new Set([
  "node_modules",
  "dist",
  ".git",
  ".tsbuild",
  ".turbo",
  ".DS_Store",
]);

function mirrorRecipes(from: string, to: string): void {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, {
    recursive: true,
    // Dereference nothing: recipes hold no symlinks worth preserving, and
    // copying them as links into a fresh tree would dangle.
    filter: (src) => {
      const base = path.basename(src);
      if (COPY_EXCLUDES.has(base)) return false;
      if (base.endsWith(".tsbuildinfo")) return false;
      return true;
    },
  });
}

/**
 * Exempt Powerhouse packages from the registry's release-age policy in
 * `workDir`.
 *
 * pnpm refuses a lockfile entry published more recently than
 * `minimumReleaseAge`, which defaults to a day. The recipes repo pins a dev
 * version of every Powerhouse package, so for the first day after a release
 * this runner cannot install at all — and the packages it is blocked on are
 * the ones under test, freshly published from this very repo. Those are the
 * one set of packages the policy is not protecting anyone from.
 *
 * `applyLinks` covers only the packages a recipe depends on directly. The
 * transitive ones still resolve from the registry at the pinned version, so
 * rewriting specifiers is not enough on its own.
 *
 * The exempted set is the one this runner's header names: the packages the
 * recipes pin to a dev version, which are released together from here.
 */
function exemptPowerhouseFromReleaseAge(workDir: string): void {
  const file = path.join(workDir, "pnpm-workspace.yaml");
  const existing = fs.readFileSync(file, "utf-8");
  if (existing.includes("minimumReleaseAgeExclude")) {
    return;
  }

  const separator = existing.endsWith("\n") ? "" : "\n";
  fs.writeFileSync(
    file,
    `${existing}${separator}\n# Added by test/recipes-e2e: the pinned Powerhouse dev version is published\n# from this checkout, so the release-age policy would block the packages\n# under test for a day after every release.\nminimumReleaseAgeExclude:\n  - "@powerhousedao/*"\n  - "@renown/*"\n  - "document-model"\n`,
  );
}

/** Rewrite the Powerhouse specifiers of every recipe in `workDir` to `link:`. */
function applyLinks(
  workDir: string,
  recipes: PackageInfo[],
  linkMap: Map<string, string>,
): void {
  for (const recipe of recipes) {
    const file = path.join(workDir, path.basename(recipe.dir), "package.json");
    const pkg = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<
      string,
      unknown
    >;

    let changed = false;
    for (const field of ["dependencies", "devDependencies"] as const) {
      const deps = pkg[field] as Record<string, string> | undefined;
      if (!deps) continue;
      for (const name of Object.keys(deps)) {
        const dir = linkMap.get(name);
        if (dir === undefined) continue;
        // Absolute, so it holds regardless of how deep the work dir sits.
        deps[name] = `link:${dir}`;
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
    }
  }
}

/**
 * Confirm the install actually produced symlinks into this checkout. A silent
 * fallback to the registry version — a stale lockfile entry, a spec this runner
 * failed to rewrite — would make the whole suite pass while testing nothing,
 * which is the one failure mode worth being loud about.
 */
function verifyLinks(
  workDir: string,
  recipes: PackageInfo[],
  linkMap: Map<string, string>,
): void {
  const problems: string[] = [];

  for (const recipe of recipes) {
    const dir = path.basename(recipe.dir);
    const specs = { ...recipe.dependencies, ...recipe.devDependencies };
    for (const name of Object.keys(specs)) {
      if (!linkMap.has(name)) continue;
      const installed = path.join(workDir, dir, "node_modules", name);
      if (!fs.existsSync(installed)) {
        problems.push(`${dir}: ${name} is not installed`);
        continue;
      }
      const real = fs.realpathSync(installed);
      if (real !== fs.realpathSync(linkMap.get(name)!)) {
        problems.push(`${dir}: ${name} resolves to ${real}, not this checkout`);
      }
    }
  }

  if (problems.length > 0) {
    fail(
      `link verification failed:\n${problems.map((p) => `  ${p}`).join("\n")}`,
    );
  }
}

/* -------------------------------------------------------------------- report */

const MARK: Record<Status, string> = {
  pass: "✅",
  fail: "❌",
  timeout: "⏱",
  skip: "⏭",
};

interface Outcome {
  recipe: string;
  phase: Phase;
  result: RunResult;
  reason?: string;
}

function report(outcomes: Outcome[]): number {
  step("Summary");

  const width = Math.max(...outcomes.map((o) => o.recipe.length), 6);
  for (const phase of PHASES) {
    const rows = outcomes.filter((o) => o.phase === phase);
    if (rows.length === 0) continue;
    console.log(`\n${phase}`);
    for (const { recipe, result, reason } of rows) {
      const seconds = (result.durationMs / 1000).toFixed(1);
      const detail =
        reason !== undefined
          ? ` (${reason})`
          : result.status === "pass"
            ? ` ${seconds}s`
            : result.status === "timeout"
              ? ` after ${seconds}s`
              : ` exit ${result.code ?? result.signal ?? "?"} (${seconds}s)`;
      console.log(`  ${MARK[result.status]} ${recipe.padEnd(width)}${detail}`);
    }
  }

  const bad = outcomes.filter(
    (o) => o.result.status === "fail" || o.result.status === "timeout",
  );

  if (bad.length > 0) {
    step(`Failures (${bad.length})`);
    for (const { recipe, phase, result } of bad) {
      console.log(`\n──── ${recipe} :: ${phase} (${result.status}) ────`);
      const lines = result.output.trimEnd().split("\n");
      console.log(lines.slice(-60).join("\n"));
    }
    console.log(
      `\n❌ ${bad.length} failing: ${bad.map((b) => `${b.recipe}:${b.phase}`).join(", ")}\n`,
    );
    return 1;
  }

  console.log("\n✅ all recipes green against this checkout\n");
  return 0;
}

/* ---------------------------------------------------------------------- main */

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  if (!fs.existsSync(path.join(options.recipesDir, "pnpm-workspace.yaml"))) {
    fail(
      `no pnpm workspace at ${options.recipesDir}\n` +
        `  pass --recipes-dir <path> or set RECIPES_DIR`,
    );
  }

  const monorepoPackages = findWorkspacePackages(MONOREPO);
  const allRecipes = findWorkspacePackages(options.recipesDir);
  const nonExiting = new Set(parseNonExitingStarts(options.recipesDir));

  const matches = (recipe: PackageInfo, needles: string[]): boolean =>
    needles.some(
      (n) => path.basename(recipe.dir).includes(n) || recipe.name.includes(n),
    );

  const recipes = allRecipes.filter((r) => {
    if (options.filters.length > 0 && !matches(r, options.filters))
      return false;
    if (options.skips.length > 0 && matches(r, options.skips)) return false;
    return true;
  });

  if (recipes.length === 0) fail("no recipes matched the given filters");

  const linkMap = buildLinkMap(monorepoPackages, recipes);
  if (linkMap.size === 0) {
    fail(
      "no recipe dependency matched a package in this checkout — " +
        "is --recipes-dir pointing at the right tree?",
    );
  }

  // Skipped up front rather than run-and-timed-out: these are long-running
  // dashboards/CLIs by design, so a timeout would be a false red.
  const plan: { recipe: PackageInfo; phase: Phase; reason?: string }[] = [];
  for (const phase of options.phases) {
    for (const recipe of recipes) {
      if (!(phase in recipe.scripts)) continue;
      const reason =
        phase === "start" && nonExiting.has(recipe.name)
          ? "does not exit by design"
          : undefined;
      plan.push({ recipe, phase, reason });
    }
  }

  console.log(`recipes:  ${options.recipesDir}`);
  console.log(`monorepo: ${MONOREPO}`);
  console.log(
    `work dir: ${options.workDir}${options.inPlace ? " (in place)" : ""}`,
  );
  console.log(`linking ${linkMap.size} package(s) from this checkout:`);
  for (const [name, dir] of [...linkMap].sort()) {
    console.log(`  ${name} → ${path.relative(MONOREPO, dir)}`);
  }
  console.log(
    `plan: ${plan.filter((p) => !p.reason).length} script(s) across ` +
      `${recipes.length} recipe(s), ${plan.filter((p) => p.reason).length} skipped`,
  );

  if (options.list) {
    for (const { recipe, phase, reason } of plan) {
      console.log(
        `  ${reason ? "skip" : "run "} ${path.basename(recipe.dir)} :: ${phase}` +
          (reason ? ` (${reason})` : ""),
      );
    }
    return;
  }

  assertBuilt(linkMap);

  const restores: (() => void)[] = [];
  const cleanup = () => {
    while (restores.length > 0) restores.pop()!();
  };
  let interrupted = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (interrupted) return;
      interrupted = true;
      console.log(`\n[cleanup] received ${signal}`);
      cleanup();
      process.exit(130);
    });
  }
  process.on("uncaughtException", (err) => {
    cleanup();
    console.error(err);
    process.exit(1);
  });

  try {
    if (options.inPlace) {
      step("Backing up recipe manifests");
      // Restore from memory rather than .bak files so an interrupt can't leave
      // the user's checkout carrying absolute link: paths.
      const targets = [
        ...allRecipes.map((r) => path.join(r.dir, "package.json")),
        path.join(options.recipesDir, "pnpm-lock.yaml"),
        path.join(options.recipesDir, "pnpm-workspace.yaml"),
      ].filter((f) => fs.existsSync(f));
      const saved = targets.map(
        (f) => [f, fs.readFileSync(f)] as [string, Buffer],
      );
      restores.push(() => {
        for (const [file, content] of saved) fs.writeFileSync(file, content);
        console.log(`[cleanup] restored ${saved.length} file(s)`);
      });
    } else {
      step("Mirroring recipes into the work dir");
      mirrorRecipes(options.recipesDir, options.workDir);
      if (!options.keep) {
        restores.push(() => {
          fs.rmSync(options.workDir, { recursive: true, force: true });
          console.log(`[cleanup] removed ${options.workDir}`);
        });
      }
    }

    step("Rewriting Powerhouse specifiers to link:");
    applyLinks(options.workDir, allRecipes, linkMap);

    step("Exempting Powerhouse packages from the release-age policy");
    exemptPowerhouseFromReleaseAge(options.workDir);

    if (options.install) {
      step("Installing");
      const install = await run(
        "pnpm",
        [
          "install",
          "--no-frozen-lockfile",
          "--config.confirmModulesPurge=false",
        ],
        { cwd: options.workDir, timeoutMs: 900_000, verbose: true },
      );
      if (install.status !== "pass") {
        fail(`pnpm install ${install.status} (exit ${install.code ?? "?"})`);
      }
    }

    step("Verifying links");
    verifyLinks(options.workDir, recipes, linkMap);
    console.log("all linked packages resolve into this checkout");

    // Serial by default: discord-webhook-processor's demo binds a fixed port
    // (9123), and several recipes spin up PGlite instances that are happier
    // not competing for CPU. Determinism is worth more here than wall time.
    const outcomes: Outcome[] = [];
    for (const { recipe, phase, reason } of plan) {
      const label = path.basename(recipe.dir);
      if (reason !== undefined) {
        outcomes.push({
          recipe: label,
          phase,
          reason,
          result: {
            status: "skip",
            code: null,
            signal: null,
            durationMs: 0,
            output: "",
          },
        });
        continue;
      }

      step(`${label} :: ${phase}`);
      const result = await run(
        "pnpm",
        ["--filter", recipe.name, "run", phase],
        {
          cwd: options.workDir,
          timeoutMs: options.timeoutMs,
          verbose: options.verbose,
          env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
        },
      );
      console.log(
        `${MARK[result.status]} ${result.status} in ${(result.durationMs / 1000).toFixed(1)}s`,
      );
      outcomes.push({ recipe: label, phase, result });
    }

    process.exitCode = report(outcomes);
  } finally {
    cleanup();
  }
}

await main();
