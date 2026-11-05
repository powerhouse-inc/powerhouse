import {
  browserEntry,
  buildBrowserBuildConfig,
  buildNodeBuildConfig,
  findBundledSharedDeps,
} from "@powerhousedao/shared/build-config";
import type { ExternalDependency } from "@powerhousedao/shared/build-pieces";
import {
  expandEntryGlobs,
  externalDepsPlugin,
  projectPath,
  undeclaredExternalDependencies,
} from "@powerhousedao/shared/build-pieces";
import {
  EXTERNALIZABLE_SHARED_SPECIFIERS,
  findSharedImports,
} from "@powerhousedao/shared/connect";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readPackage } from "read-pkg";
import { build as tsdownBuild } from "tsdown";
import { noConnectImports } from "../../../utils/offered-routes-imports.js";
import { offeredRoutesManifest } from "../../../utils/offered-routes-manifest.js";
import {
  HOST_ROUTES_DIR,
  OFFERED_ROUTES_MODULE,
} from "../../../utils/sync-connect-routes.js";
import type { StandardBuildStep } from "./context.js";
import { stageLogger } from "./stage-logger.js";

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

// Everything in the browser build is code Connect can load: native fails it.
export const browserBundleStep: StandardBuildStep = {
  id: "browser-bundle",
  run: async (ctx) => {
    const { args, projectRoot, session, trace, detection, findings } = ctx;
    const stage = session.stage();
    const sharedDeps = !args.noSharedDeps;
    const routesEntry = join(projectRoot, OFFERED_ROUTES_MODULE);
    const config = buildBrowserBuildConfig({
      sharedDeps,
      plugins: [
        externalDepsPlugin(trace, new Map(), {
          root: projectRoot,
          browser: true,
          cache: detection,
        }),
        offeredRoutesManifest(projectRoot, findings.offersRoutes),
        noConnectImports(routesEntry, join(projectRoot, HOST_ROUTES_DIR)),
      ],
    });
    await tsdownBuild({
      ...config,
      // The manifest copy lands in the stage when it stands in for dist/.
      ...(session.writesPackageDist && {
        copy: [{ from: "powerhouse.manifest.json", to: stage }],
      }),
      // The offered routes in the package's build: a module both import is one
      // chunk, which other Connects evaluate once. Absolute: a relative entry
      // is a glob, and globs skip `.ph`.
      ...(findings.offersRoutes
        ? { entry: [...browserEntry, { "connect-routes": routesEntry }] }
        : {}),
      outDir: join(stage, "browser"),
      customLogger: stageLogger(ctx),
    });

    // Advisory: a shared dep the source imports but the output no longer
    // references as a bare import was inlined despite the external set.
    if (sharedDeps) {
      const imported = findSharedImportsInSources(projectRoot, browserEntry);
      const bundled = findBundledSharedDeps(
        imported,
        readDistBrowserFiles(join(stage, "browser")),
      );
      if (bundled.length > 0) {
        console.warn(
          `⚠ shared deps bundled instead of externalized: ${bundled.join(", ")} — check your neverBundle config`,
        );
      }
    }
  },
};

// A package with a native addon or WebAssembly module stays external, so the
// package's consumers must install it: devDependencies are skipped by every install.
export function assertExternalDependenciesDeclared(
  projectRoot: string,
  found: ExternalDependency[],
  pkg: Parameters<typeof undeclaredExternalDependencies>[1],
) {
  for (const dep of found) {
    console.log(
      `${dep.name}@${dep.version} stays external, it needs ${projectPath(projectRoot, dep.file)}`,
    );
  }
  const undeclared = undeclaredExternalDependencies(found, pkg);
  if (undeclared.length === 0) return;
  const lines = undeclared.map(
    (dep) =>
      `  ${dep.name}${dep.importer ? ` (imported by ${projectPath(projectRoot, dep.importer)})` : ""}`,
  );
  throw new Error(
    `Packages with native addons or WebAssembly modules must be listed in package.json "dependencies", "optionalDependencies" or "peerDependencies":\n` +
      `${lines.join("\n")}\n\n` +
      `They stay external to the build, and installs of this package skip devDependencies.`,
  );
}

export const nodeBundleStep: StandardBuildStep = {
  id: "node-bundle",
  run: async (ctx) => {
    const { args, projectRoot, session, trace, detection, findings } = ctx;
    await tsdownBuild({
      ...buildNodeBuildConfig({
        sharedDeps: !args.noSharedDeps,
        plugins: [
          // Editors never run on a host; document models and scalars run in Connect too.
          externalDepsPlugin(trace, findings.external, {
            root: projectRoot,
            ignoreDirs: ["editors"],
            forbidDirs: ["document-models", "scalars"],
            cache: detection,
          }),
        ],
      }),
      outDir: join(session.stage(), "node"),
      customLogger: stageLogger(ctx),
    });
    findings.pkg = await readPackage({ cwd: projectRoot });
    assertExternalDependenciesDeclared(
      projectRoot,
      [...findings.external.values()],
      findings.pkg,
    );
  },
};

/** The output entry each bundle step writes, which tsdown empties first. */
const CLEANED_BY_STEP = new Map([
  [browserBundleStep.id, "browser"],
  [nodeBundleStep.id, "node"],
]);

/** The output entries `steps` empty before they write them, by step id. */
export const entriesCleanedBy = (
  steps: readonly { readonly id: string }[],
): string[] => steps.flatMap(({ id }) => CLEANED_BY_STEP.get(id) ?? []);
