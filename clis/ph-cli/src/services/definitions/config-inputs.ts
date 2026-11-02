import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { satisfies } from "semver";

// Resolve extends without loading the TypeScript compiler API at runtime.
const configSchema = z.object({
  extends: z.union([z.string(), z.array(z.string())]).optional(),
  compilerOptions: z.record(z.string(), z.json()).optional(),
});

export function readConfig(path: string): unknown {
  const text = readFileSync(path, "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/"(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, (token) =>
      token.startsWith('"') ? token : "",
    )
    .replace(/"(?:\\.|[^"\\])*"|,\s*(?=[}\]])/g, (token) =>
      token.startsWith('"') ? token : "",
    );
  return JSON.parse(text);
}

const manifestSchema = z.object({
  tsconfig: z.string().optional(),
  exports: z.json().optional(),
  typesVersions: z
    .record(z.string(), z.record(z.string(), z.array(z.string())))
    .optional(),
});
type ExportTarget = z.infer<ReturnType<typeof z.json>>;

export function configDirOptions(
  configFile: string,
  compilerVersion: string,
): Record<string, ExportTarget> {
  const visiting = new Set<string>();
  const options = (path: string): Record<string, ExportTarget> => {
    if (visiting.has(path)) return {};
    visiting.add(path);
    const config = configSchema.parse(readConfig(path));
    const bases =
      typeof config.extends === "string"
        ? [config.extends]
        : (config.extends ?? []);
    const inherited: Record<string, ExportTarget> = {};
    for (const base of bases)
      Object.assign(
        inherited,
        options(extendedConfig(path, base, compilerVersion)),
      );
    visiting.delete(path);
    return { ...inherited, ...config.compilerOptions };
  };
  const substitute = (value: ExportTarget): ExportTarget => {
    if (typeof value === "string")
      return value.replaceAll("${configDir}", dirname(configFile));
    if (Array.isArray(value)) return value.map(substitute);
    if (value !== null && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, substitute(entry)]),
      );
    return value;
  };
  return Object.fromEntries(
    Object.entries(options(configFile))
      .filter(([, value]) => JSON.stringify(value).includes("${configDir}"))
      .map(([key, value]) => [key, substitute(value)]),
  );
}

function file(path: string): string | undefined {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ? path : undefined;
}

function jsonFile(path: string): string | undefined {
  if (path.endsWith(".json")) return file(path);
  const rewritten = path.replace(/\.(?:js|ts)$/, "");
  return file(`${rewritten}.json`) ?? file(`${path}.json`);
}

function matchedPath(
  paths: Readonly<Record<string, unknown>>,
  name: string,
  exports = false,
): { key: string; match: string } | undefined {
  if (Object.hasOwn(paths, name)) return { key: name, match: "" };
  const keys = Object.keys(paths).filter(
    (key) =>
      (key.includes("*") && key.indexOf("*") === key.lastIndexOf("*")) ||
      (exports && key.endsWith("/")),
  );
  keys.sort((a, b) => {
    const prefix = (key: string) =>
      key.includes("*") ? key.indexOf("*") + 1 : key.length;
    return (
      prefix(b) - prefix(a) ||
      (exports
        ? Number(!a.includes("*")) - Number(!b.includes("*")) ||
          b.length - a.length
        : 0)
    );
  });
  for (const key of keys) {
    const star = key.indexOf("*");
    if (
      star !== -1 &&
      name.startsWith(key.slice(0, star)) &&
      name.endsWith(key.slice(star + 1))
    )
      return {
        key,
        match: name.slice(star, name.length - (key.length - star - 1)),
      };
    if (star === -1 && name.startsWith(key))
      return { key, match: name.slice(key.length) };
  }
  return undefined;
}

function exportedConfig(
  target: ExportTarget,
  directory: string,
  compilerVersion: string,
  match: string,
  pattern: boolean,
): { path?: string } | undefined {
  if (typeof target === "string") {
    if (
      !target.startsWith("./") ||
      (!pattern && match !== "" && !target.endsWith("/"))
    )
      return {};
    const path = pattern ? target.replaceAll("*", match) : target + match;
    if (
      path
        .slice(2)
        .split("/")
        .some(
          (part) => part === "." || part === ".." || part === "node_modules",
        )
    )
      return {};
    const resolved = jsonFile(resolve(directory, path));
    return resolved === undefined ? {} : { path: resolved };
  }
  if (target === null) return {};
  if (Array.isArray(target)) {
    if (target.length === 0) return {};
    for (const entry of target) {
      const result = exportedConfig(
        entry,
        directory,
        compilerVersion,
        match,
        pattern,
      );
      if (result !== undefined) return result;
    }
  } else if (typeof target === "object") {
    for (const [condition, entry] of Object.entries(target))
      if (
        ["types", "require", "node", "default"].includes(condition) ||
        (condition.startsWith("types@") &&
          satisfies(compilerVersion, condition.slice(6)))
      ) {
        const result = exportedConfig(
          entry,
          directory,
          compilerVersion,
          match,
          pattern,
        );
        if (result !== undefined) return result;
      }
  } else return {};
  return undefined;
}

function extendedConfig(
  configFile: string,
  input: string,
  compilerVersion: string,
): string {
  const specifier = input.replaceAll("\\", "/");
  if (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    isAbsolute(specifier)
  ) {
    const path = resolve(dirname(configFile), specifier);
    const found =
      file(path) ??
      (!path.endsWith(".json") ? file(`${path}.json`) : undefined);
    if (found !== undefined) return found;
  } else {
    const parts = specifier.split("/");
    const nameLength = specifier.startsWith("@") ? 2 : 1;
    const packageName = parts.slice(0, nameLength).join("/");
    const subpath = parts.slice(nameLength).join("/");
    const manifestAt = (directory: string) => {
      const path = join(directory, "package.json");
      if (!existsSync(path)) return undefined;
      return manifestSchema.parse(readConfig(path));
    };
    const fromDirectory = (
      directory: string,
      pkg: ReturnType<typeof manifestAt>,
    ): string | undefined => {
      const versionPaths = Object.entries(pkg?.typesVersions ?? {}).find(
        ([range]) => satisfies(compilerVersion, range),
      )?.[1];
      const entry = pkg?.tsconfig
        ? resolve(directory, pkg.tsconfig)
        : join(directory, "tsconfig");
      if (versionPaths !== undefined) {
        const match = matchedPath(
          versionPaths,
          entry.slice(directory.length + 1),
        );
        if (match !== undefined)
          for (const path of versionPaths[match.key] ?? []) {
            const found = jsonFile(
              resolve(directory, path.replace("*", match.match)),
            );
            if (found !== undefined) return found;
          }
      }
      return (
        (pkg?.tsconfig ? jsonFile(entry) : undefined) ??
        jsonFile(join(directory, "tsconfig"))
      );
    };
    for (const modules of createRequire(configFile).resolve.paths(specifier) ??
      []) {
      const directory = join(modules, packageName);
      const candidate = join(modules, specifier);
      const nested = manifestAt(candidate);
      const pkg = subpath === "" ? nested : manifestAt(directory);
      if (subpath !== "" && nested !== undefined && !pkg?.exports) {
        const found = jsonFile(candidate) ?? fromDirectory(candidate, nested);
        if (found !== undefined) return found;
        continue;
      }
      if (pkg?.exports) {
        const exports = pkg.exports;
        const key = subpath === "" ? "." : `./${subpath}`;
        let target: ExportTarget | undefined;
        let match = "";
        let pattern = false;
        if (
          typeof exports === "object" &&
          !Array.isArray(exports) &&
          Object.keys(exports).some((key) => key.startsWith("."))
        ) {
          const matched = matchedPath(exports, key, true);
          if (matched !== undefined) {
            target = exports[matched.key];
            match = matched.match;
            pattern = matched.key.includes("*");
          }
        } else if (key === ".") target = exports;
        const found =
          target === undefined
            ? undefined
            : exportedConfig(target, directory, compilerVersion, match, pattern)
                ?.path;
        if (found !== undefined) return found;
        continue;
      }
      const versionPaths = Object.entries(pkg?.typesVersions ?? {}).find(
        ([range]) => satisfies(compilerVersion, range),
      )?.[1];
      if (subpath !== "" && versionPaths !== undefined) {
        const match = matchedPath(versionPaths, subpath);
        if (match !== undefined)
          for (const path of versionPaths[match.key] ?? []) {
            const found = jsonFile(
              resolve(directory, path.replace("*", match.match)),
            );
            if (found !== undefined) return found;
          }
      }
      const found = jsonFile(candidate) ?? fromDirectory(candidate, pkg);
      if (found !== undefined) return found;
    }
  }
  throw new Error(
    `The extended TypeScript config ${JSON.stringify(specifier)} could not be resolved from ${JSON.stringify(configFile)}.`,
  );
}
