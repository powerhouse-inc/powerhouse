import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { globSync, escape } from "glob";

const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const put = (file, value) =>
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const literal = (file) => escape(file.replaceAll("\\", "/"));

export function prepareVitest(job, nestedTrees = []) {
  mkdirSync(job.out, { recursive: true });
  if (/--config(?:[=\s]|$)/.test(job.originalScript))
    throw new Error(
      "An existing --config needs a dedicated coverage adapter; the package script was left unchanged",
    );
  const allowed = new Set(job.files.map((file) => resolve(job.root, file)));
  const excludes = globSync(
    "**/*.{test,spec}.{js,jsx,mjs,cjs,ts,tsx,mts,cts}",
    {
      cwd: job.root,
      absolute: true,
      dot: true,
      nodir: true,
      ignore: [
        "**/node_modules/**",
        "**/.git/**",
        ...nestedTrees
          .map((tree) => relative(job.root, tree).replaceAll("\\", "/"))
          .filter((tree) => tree && !tree.startsWith(".."))
          .map((tree) => `${literal(tree)}/**`),
      ],
      follow: false,
    },
  )
    .filter((file) => !allowed.has(file))
    .map(literal);
  job.coverageInput = join(job.out, "coverage-input.json");
  put(job.coverageInput, { excludes });
  const config = join(job.out, "coverage.config.mjs");
  job.coverageArgs = [`--config=${config}`];
  writeFileSync(
    config,
    `import { coverageConfig } from ${JSON.stringify(import.meta.url)};\nexport default (env) => coverageConfig(${JSON.stringify(join(job.out, "job.json"))}, env);\n`,
  );
  put(join(job.out, "job.json"), job);
  return [...job.args, ...job.coverageArgs];
}

export async function coverageConfig(file, configEnv) {
  const job = read(file);
  const localRequire = createRequire(resolve(job.cwd, "package.json"));
  const vitestPath = localRequire.resolve("vitest/node");
  const { resolveConfig, parseCLI } = await import(pathToFileURL(vitestPath));
  const { configDefaults } = await import(
    pathToFileURL(localRequire.resolve("vitest/config"))
  );
  const { loadConfigFromFile } = await import(
    pathToFileURL(createRequire(vitestPath).resolve("vite"))
  );
  const originalArgs = process.argv.slice(2, -job.coverageArgs.length);
  const { options } = parseCLI(["vitest", ...originalArgs]);
  const native = await resolveConfig({
    root: options.root ? resolve(job.cwd, options.root) : job.cwd,
    config: options.config,
    mode: options.mode,
    configLoader: options.configLoader,
  });
  const base = native.configFile
    ? (
        await loadConfigFromFile(
          configEnv,
          native.configFile,
          native.root,
          undefined,
          undefined,
          options.configLoader,
        )
      ).config
    : {};
  const test = base.test ?? {};
  if (
    test.projects?.some(
      (project) =>
        typeof project !== "object" ||
        project.extends === false ||
        typeof project.extends === "string",
    )
  )
    throw new Error(
      "Non-inheriting/file-based projects need a dedicated coverage adapter; the package configuration was left unchanged",
    );
  const browserTests = [
    test,
    ...(test.projects ?? []).map((project) => project.test ?? {}),
  ];
  const firefox = browserTests.some(
    (project) =>
      project.browser?.enabled &&
      project.browser.instances?.some(
        (instance) => instance.browser !== "chromium",
      ),
  );
  return {
    ...base,
    test: {
      ...test,
      watch: false,
      exclude: [
        ...(test.exclude ?? configDefaults.exclude),
        ...read(job.coverageInput).excludes,
      ],
      env: { ...test.env, ...job.env },
      reporters: ["default", "json"],
      outputFile: { json: join(job.out, "tests.json") },
      coverage: {
        ...test.coverage,
        // Package thresholds describe the package's own include list, not this measurement.
        thresholds: undefined,
        enabled: true,
        provider: firefox ? "istanbul" : "v8",
        allowExternal: true,
        reportOnFailure: true,
        // Untouched source is seeded once by the final renderer.
        include: undefined,
        exclude: [],
        reportsDirectory: join(job.out, "vitest"),
        reporter: [["lcovonly", { projectRoot: job.root }], "json-summary"],
      },
    },
  };
}

export function recordVitestSelection(job) {
  const file = join(job.out, "tests.json");
  const data = existsSync(file) ? read(file) : null;
  const selected = [
    ...new Set(
      (data?.testResults ?? []).map(({ name }) =>
        relative(job.root, resolve(name)).replaceAll("\\", "/"),
      ),
    ),
  ];
  const unexpected = selected.filter((file) => !job.files.includes(file));
  const error = !data
    ? "Native JSON outcomes are missing"
    : unexpected.length
      ? `Native selection escaped the requested Git-visible tier: ${unexpected.join(", ")}`
      : null;
  put(join(job.out, "selection.json"), {
    discovered: selected,
    selected,
    completed: !!data,
    error,
  });
  if (error) job.withholdCoverage = error;
}
