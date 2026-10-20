import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import type { Agent } from "package-manager-detector";
import { z } from "zod";
import {
  CompilePreflightError,
  commonSourceDirectory,
  declarationOutputs,
  runLocal,
  runtimeOutput,
  type CompilePlan,
  type CompilerProject,
} from "./compiler.js";
import { listedFiles, tracedResolutions } from "./compiler-output.js";
import { configPathsBase } from "./config-inputs.js";
import { walkFiles } from "./file-walk.js";
import { canonicalPath, pathWithin, scratchDirectory } from "./paths.js";
import { fileEntriesDigest } from "./package-revision.js";

function resolveReferenceDeclarations(project: CompilerProject): boolean {
  // TypeScript 5's noResolve skips project-reference declaration redirects.
  return (
    Number(project.compilerVersion.split(".")[0]) < 7 &&
    project.references.length !== 0
  );
}

function loaderConfig(
  project: CompilerProject,
  files: readonly string[],
  rootDir: string,
  outDir: string,
) {
  const directory = dirname(project.configFile);
  const baseUrl =
    project.options.baseUrl === undefined
      ? undefined
      : resolve(directory, project.options.baseUrl);
  const pathsBase =
    baseUrl ??
    configPathsBase(project.configFile, project.compilerVersion) ??
    directory;
  return {
    extends: project.configFile,
    compilerOptions: {
      ...(baseUrl !== undefined && { baseUrl }),
      ...(project.options.paths !== undefined && {
        paths: Object.fromEntries(
          Object.entries(project.options.paths).map(([key, values]) => [
            key,
            values.map((value) => resolve(pathsBase, value)),
          ]),
        ),
      }),
      ...(project.options.rootDirs !== undefined && {
        rootDirs: project.options.rootDirs.map((value) =>
          resolve(directory, value),
        ),
      }),
      ...(project.options.typeRoots !== undefined && {
        typeRoots: project.options.typeRoots.map((value) =>
          resolve(directory, value),
        ),
      }),
      declarationDir: null,
      outFile: null,
      mapRoot: null,
      tsBuildInfoFile: null,
      noCheck: true,
      noResolve: !resolveReferenceDeclarations(project),
      noEmit: false,
      noEmitOnError: false,
      declaration: false,
      composite: false,
      incremental: false,
      emitDeclarationOnly: false,
      declarationMap: false,
      isolatedDeclarations: false,
      sourceMap: true,
      inlineSourceMap: false,
      inlineSources: false,
      sourceRoot: null,
      rootDir,
      outDir,
      ...(project.options.allowImportingTsExtensions && {
        rewriteRelativeImportExtensions: true,
      }),
    },
    files,
    include: [],
    references: project.references.map((path) => ({ path })),
  };
}

function sourceRuntime(source: string, project: CompilerProject): string {
  return source.replace(/\.(tsx|ts|mts|cts)$/, (_, extension: string) =>
    extension === "mts"
      ? ".mjs"
      : extension === "cts"
        ? ".cjs"
        : extension === "tsx" && project.options.jsx === "preserve"
          ? ".jsx"
          : ".js",
  );
}

function runtimeFormat(
  url: string,
  project?: CompilerProject,
): "module" | "commonjs" | "json" {
  const path = fileURLToPath(url);
  const extension = extname(path);
  if (extension === ".mjs") return "module";
  if (extension === ".cjs") return "commonjs";
  if (extension === ".json") return "json";
  const module = project?.options.module;
  if (module !== undefined && /^(es(?:6|\d{4}|next)|preserve)$/.test(module))
    return "module";
  if (project !== undefined && !/^node(?:16|18|20|next)$/.test(module ?? ""))
    return "commonjs";
  let directory = dirname(path);
  let manifest: string | undefined;
  while (basename(directory) !== "node_modules") {
    const candidate = join(directory, "package.json");
    if (existsSync(candidate)) {
      manifest = candidate;
      break;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  const scope =
    manifest === undefined
      ? undefined
      : z
          .object({ type: z.string().optional() })
          .parse(JSON.parse(readFileSync(manifest, "utf8")));
  return scope?.type === "module" ? "module" : "commonjs";
}

const sourceMapSchema = z.looseObject({ sources: z.array(z.string()) });

function commonJSPrefix(source: string): number {
  let prefix = source.startsWith("#!") ? source.indexOf("\n") + 1 : 0;
  for (;;) {
    const directive =
      /^(?:\s|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)*(?:"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"|'(?:\\(?:\r\n|[\s\S])|[^'\\\r\n])*')((?:\s|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)*)(;?)/.exec(
        source.slice(prefix),
      );
    if (directive === null) return prefix;
    const next = source.slice(prefix + directive[0].length);
    if (
      directive[2] === "" &&
      next !== "" &&
      (!/[\r\n\u2028\u2029]/.test(directive[1]) ||
        /^(?:[([.`*/%<>=?&|^]|[+-](?![+-])|!=|(?:in|instanceof)\b)/.test(next))
    )
      return prefix;
    prefix += directive[0].length;
  }
}

type OverlayModule = {
  readonly emitted: string;
  readonly imports: ReadonlyMap<string, string>;
  readonly format: ReturnType<typeof runtimeFormat>;
};

function loaderSources(project: CompilerProject): string[] {
  return [
    ...new Set([
      ...project.sources,
      ...project.files.filter(
        (file) => /\.[cm]?tsx?$/i.test(file) && !/\.d\.[cm]?ts$/i.test(file),
      ),
    ]),
  ];
}

export async function emitLoaderModules(
  packageRoot: string,
  agent: Agent,
  emittedRoot: string,
  plan: CompilePlan,
) {
  const maps = await emitLoaderPrograms({
    packageRoot,
    agent,
    emittedRoot,
    plan,
  });
  return {
    modules: maps.modules,
    diagnostics: maps.diagnostics,
    ...registerLoaderHooks(maps),
  };
}

async function emitLoaderPrograms({
  packageRoot,
  agent,
  emittedRoot,
  plan,
}: {
  readonly packageRoot: string;
  readonly agent: Agent;
  readonly emittedRoot: string;
  readonly plan: CompilePlan;
}) {
  const modules = new Map<string, string>();
  const overlay = new Map<string, OverlayModule>();
  const sourceURLs = new Map<string, string>();
  const outputURLs = new Map<string, string>();
  const runtimeURLs = new Map<string, string>();
  const runtimeFiles = new Map<string, string>();
  const diagnostics: string[] = [];
  const scratch = scratchDirectory(packageRoot);
  const assertWrite = (path: string): string => {
    const target = canonicalPath(path, { resolveMissingLinks: true });
    if (pathWithin(scratch, target) === null)
      throw new CompilePreflightError(
        `The private loader would write ${JSON.stringify(path)} outside its scratch root ${JSON.stringify(scratch)}.`,
      );
    return target;
  };
  const generation = randomUUID();
  const tagged = (path: string): string => {
    const url = pathToFileURL(
      canonicalPath(path, { resolveMissingLinks: true }),
    );
    url.searchParams.set("ph-loader", generation);
    return url.href;
  };
  const layouts = (plan.loadDefinitions ? plan.projects : [])
    .map((project, index) => {
      const references = new Set(
        plan.projects
          .slice(index + 1)
          .flatMap(loaderSources)
          .map((source) => canonicalPath(source)),
      );
      return {
        project,
        sources: loaderSources(project).filter(
          (source) => !references.has(canonicalPath(source)),
        ),
      };
    })
    .filter(({ sources }) => sources.length !== 0);
  const declarationContext = plan.projects.flatMap(declarationOutputs);

  for (const [index, { project, sources }] of layouts.entries()) {
    const traced = await runLocal(packageRoot, agent, [
      "tsc",
      "-p",
      project.configFile,
      "--listFilesOnly",
      "--traceResolution",
      "--pretty",
      "false",
    ]);
    const resolutions = tracedResolutions(traced.output);
    const files = [
      ...new Set([
        ...sources,
        ...declarationContext,
        ...project.files.filter((file) => /\.d\.[cm]?ts$/i.test(file)),
      ]),
    ];
    let rootDir = commonSourceDirectory(
      files
        .filter((file) => !/\.d\.[cm]?ts$/i.test(file))
        .flatMap((file) => [file, canonicalPath(file)]),
      packageRoot,
    );
    const canonicalFiles = [
      ...new Set(files.map((file) => canonicalPath(file))),
    ];
    const programRoot = assertWrite(join(emittedRoot, "emit", String(index)));
    mkdirSync(programRoot, { recursive: true });
    const configFile = assertWrite(
      join(dirname(emittedRoot), `loader-${index}.tsconfig.json`),
    );
    writeFileSync(
      configFile,
      JSON.stringify(
        loaderConfig(project, canonicalFiles, rootDir, programRoot),
      ),
    );
    if (resolveReferenceDeclarations(project)) {
      const listed = await runLocal(packageRoot, agent, [
        "tsc",
        "-p",
        configFile,
        "--listFilesOnly",
        "--pretty",
        "false",
      ]);
      const context = listedFiles(listed.output, packageRoot).filter(
        (file) => !/\.d\.[cm]?ts$/i.test(file),
      );
      if (context.length === 0) throw new CompilePreflightError(listed.output);
      rootDir = commonSourceDirectory(
        [
          ...canonicalFiles.filter((file) => !/\.d\.[cm]?ts$/i.test(file)),
          ...context.flatMap((file) => [file, canonicalPath(file)]),
        ],
        rootDir,
      );
      writeFileSync(
        configFile,
        JSON.stringify(
          loaderConfig(project, canonicalFiles, rootDir, programRoot),
        ),
      );
    }
    const emitted = await runLocal(packageRoot, agent, [
      "tsc",
      "-p",
      configFile,
      "--listEmittedFiles",
      "--pretty",
      "false",
    ]);
    for (const line of emitted.output.split(/\r?\n/)) {
      if (!line.startsWith("TSFILE: ")) continue;
      const file = canonicalPath(resolve(packageRoot, line.slice(8).trim()));
      if (pathWithin(emittedRoot, file) === null)
        throw new CompilePreflightError(
          `The private loader emitted ${JSON.stringify(file)} outside its scratch root ${JSON.stringify(emittedRoot)}.`,
        );
    }
    if (!emitted.ok)
      diagnostics.push(
        emitted.output
          .split(/\r?\n/)
          .filter((line) => !line.startsWith("TSFILE: "))
          .join("\n"),
      );
    const emittedSources = new Map<string, string>();
    for (const mapPath of walkFiles(programRoot)) {
      if (!/\.[cm]?jsx?\.map$/.test(mapPath)) continue;
      const map = sourceMapSchema.parse(
        JSON.parse(readFileSync(mapPath, "utf8")),
      );
      for (const source of map.sources)
        emittedSources.set(
          canonicalPath(resolve(dirname(mapPath), source)),
          mapPath.slice(0, -4),
        );
    }
    const projectSources = new Set(
      project.sources.map((source) => canonicalPath(source)),
    );
    for (const source of sources) {
      const path = canonicalPath(source);
      const emitted = /\.json$/i.test(path) ? path : emittedSources.get(path);
      if (emitted === undefined) continue;
      const url = tagged(sourceRuntime(path, project));
      const imports = new Map(resolutions.get(path) ?? []);
      if (
        project.options.allowImportingTsExtensions ||
        project.options.rewriteRelativeImportExtensions
      )
        for (const [specifier, target] of [...imports])
          if (specifier.startsWith("."))
            imports.set(sourceRuntime(specifier, project), target);
      overlay.set(url, {
        emitted,
        imports,
        format: runtimeFormat(url, project),
      });
      runtimeURLs.set(
        canonicalPath(sourceRuntime(path, project), {
          resolveMissingLinks: true,
        }),
        url,
      );
      sourceURLs.set(path, url);
      modules.set(path, url);
      if (!projectSources.has(path)) continue;
      const output = canonicalPath(runtimeOutput(project, source), {
        resolveMissingLinks: true,
      });
      outputURLs.set(
        output,
        existsSync(output) && project !== plan.projects[0]
          ? tagged(output)
          : url,
      );
      if (project.external && existsSync(output))
        runtimeFiles.set(
          output,
          createHash("sha256").update(readFileSync(output)).digest("hex"),
        );
    }
  }
  return {
    modules,
    overlay,
    sourceURLs,
    outputURLs,
    runtimeURLs,
    runtimeFiles,
    tagged,
    diagnostics: diagnostics.join("\n"),
  };
}

function registerLoaderHooks(
  maps: Awaited<ReturnType<typeof emitLoaderPrograms>>,
) {
  const { overlay, sourceURLs, outputURLs, runtimeURLs, runtimeFiles, tagged } =
    maps;
  const loadedRuntimeFiles = () => {
    const entries = [...runtimeFiles].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return {
      files: entries.map(([path]) => path),
      digest: fileEntriesDigest(entries),
    };
  };
  if (overlay.size === 0)
    return { dispose: () => undefined, loadedRuntimeFiles };
  const owned = new Set([...overlay.keys(), ...outputURLs.values()]);
  const commonJSParents = new Map<string, string>();
  const cache = createRequire(import.meta.url).cache;
  const commonJSFiles = [
    ...new Set(
      [...owned]
        .filter(
          (url) =>
            (overlay.get(url)?.format ?? runtimeFormat(url)) === "commonjs",
        )
        .map((url) => fileURLToPath(url)),
    ),
  ];
  const previousModules = new Map(
    commonJSFiles.map((file) => [file, cache[file]]),
  );
  for (const file of commonJSFiles) delete cache[file];
  for (const url of owned)
    if ((overlay.get(url)?.format ?? runtimeFormat(url)) === "commonjs")
      commonJSParents.set(pathToFileURL(fileURLToPath(url)).href, url);
  const mutableRuntimeURL = (path: string): string => {
    const url = tagged(path);
    owned.add(url);
    const file = fileURLToPath(url);
    if (!previousModules.has(file)) {
      previousModules.set(file, cache[file]);
      delete cache[file];
    }
    commonJSParents.set(pathToFileURL(file).href, url);
    return url;
  };
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (owned.has(specifier)) return { url: specifier, shortCircuit: true };
      const parentURL =
        context.parentURL === undefined
          ? undefined
          : (commonJSParents.get(context.parentURL) ?? context.parentURL);
      if (parentURL === undefined || !owned.has(parentURL))
        return nextResolve(specifier, context);
      const parent = new URL(parentURL);
      parent.searchParams.delete("ph-loader");
      const imports = overlay.get(parentURL)?.imports;
      const resolved = imports?.get(specifier);
      let tracedRuntime: string | undefined;
      if (resolved !== undefined && !specifier.startsWith("node:")) {
        const runtime = resolved.replace(
          /\.d\.(ts|mts|cts)$/,
          (_, extension: string) =>
            extension === "mts" ? ".mjs" : extension === "cts" ? ".cjs" : ".js",
        );
        const target = sourceURLs.get(resolved) ?? outputURLs.get(runtime);
        if (target !== undefined) return { url: target, shortCircuit: true };
        if (/\.d\.[cm]?ts$/.test(resolved)) {
          const base = resolved.replace(/\.d\.[cm]?ts$/, "");
          tracedRuntime = [
            runtime,
            ...[".js", ".mjs", ".cjs"].map((ext) => base + ext),
          ].find((path) => existsSync(path));
        }
      }
      if (specifier.startsWith(".")) {
        const path = canonicalPath(fileURLToPath(new URL(specifier, parent)), {
          resolveMissingLinks: true,
        });
        const target = outputURLs.get(path) ?? runtimeURLs.get(path);
        if (target !== undefined) return { url: target, shortCircuit: true };
      }
      let result: ReturnType<typeof nextResolve>;
      try {
        result = nextResolve(specifier, { ...context, parentURL: parent.href });
      } catch (error) {
        if (tracedRuntime === undefined) throw error;
        result = { url: pathToFileURL(tracedRuntime).href, shortCircuit: true };
      }
      if (result.url.startsWith("file:")) {
        const path = canonicalPath(fileURLToPath(result.url));
        const target = outputURLs.get(path) ?? sourceURLs.get(path);
        if (target !== undefined) return { ...result, url: target };
        if (!/[\\/]node_modules[\\/]/.test(path))
          return { ...result, url: mutableRuntimeURL(path) };
      }
      return result;
    },
    load(url, context, nextLoad) {
      const ownedURL = commonJSParents.get(url) ?? url;
      if (!owned.has(ownedURL)) return nextLoad(url, context);
      const entry = overlay.get(ownedURL);
      const loaded =
        entry === undefined
          ? nextLoad(url, context)
          : {
              format: entry.format,
              source: readFileSync(entry.emitted, "utf8"),
              shortCircuit: true,
            };
      if (entry === undefined) {
        const path = canonicalPath(fileURLToPath(url));
        if (!/[\\/]node_modules[\\/]/.test(path) && !runtimeFiles.has(path)) {
          const source = loaded.source;
          const bytes =
            source == null
              ? readFileSync(path)
              : typeof source === "string"
                ? source
                : source instanceof ArrayBuffer
                  ? new Uint8Array(source)
                  : new Uint8Array(
                      source.buffer,
                      source.byteOffset,
                      source.byteLength,
                    );
          runtimeFiles.set(
            path,
            createHash("sha256").update(bytes).digest("hex"),
          );
        }
      }
      if (loaded.format !== "commonjs") return loaded;
      // Node 24.14's import() CJS translator supplies an unhooked require.
      const source =
        typeof loaded.source === "string"
          ? loaded.source
          : loaded.source == null
            ? readFileSync(fileURLToPath(url), "utf8")
            : new TextDecoder().decode(loaded.source);
      const prefix = commonJSPrefix(source);
      commonJSParents.set(pathToFileURL(fileURLToPath(url)).href, ownedURL);
      return {
        ...loaded,
        source: `${source.slice(0, prefix)}require = require("node:module").createRequire(__filename);\n${source.slice(prefix)}`,
        shortCircuit: true,
      };
    },
  });
  return {
    loadedRuntimeFiles,
    dispose: () => {
      hook.deregister();
      for (const [file, previous] of previousModules) {
        delete cache[file];
        if (previous !== undefined) cache[file] = previous;
      }
    },
  };
}
