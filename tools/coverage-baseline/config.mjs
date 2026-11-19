import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sourceIncluded, ownerOf } from "./scope.mjs";

export function sourceFiles(root) {
  return [
    ...new Set(
      execFileSync(
        "git",
        [
          "-C",
          root,
          "ls-files",
          "-z",
          "--cached",
          "--others",
          "--exclude-standard",
        ],
        { maxBuffer: 32 * 1024 * 1024 },
      )
        .toString()
        .split("\0"),
    ),
  ]
    .filter((path) => sourceIncluded(path) && existsSync(resolve(root, path)))
    .sort();
}

export function sourcePath(root, value, info = {}) {
  root = realpathSync(root);
  if (info.url) value = info.url;
  if (value.startsWith("file:")) value = fileURLToPath(value);
  if (/^https?:/.test(value)) {
    const pathname = new URL(value).pathname;
    value = pathname.startsWith("/@fs/")
      ? fileURLToPath(`file://${pathname.slice(4)}`)
      : decodeURIComponent(pathname).replace(/^\//, "");
  }
  value = value.replaceAll("\\", "/").split("?")[0];
  if (info.distFile && !value.startsWith("/") && !/^\w+:/.test(value)) {
    value = resolve(root, dirname(sourcePath(root, info.distFile)), value);
  }
  const local = relative(root, resolve(root, value)).replaceAll("\\", "/");
  if (!local.startsWith("../")) return local;
  return value.replace(
    /^.*?\/(?=(?:apps|clis|packages|test|tools|scripts|releases)\/)/,
    "",
  );
}

export function monocartOptions(root, outputDir, sources, mappingErrors = []) {
  root = realpathSync(root);
  const selected = new Set(sources);
  const packages = new Map();
  for (const owner of new Set(sources.map(ownerOf))) {
    const path = resolve(root, owner, "package.json");
    if (existsSync(path))
      packages.set(JSON.parse(readFileSync(path, "utf8")).name, owner);
  }
  const normalize = (path, info = {}) => {
    const original = info.url ?? path;
    if (selected.has(original)) return original;
    const packed = (value) => {
      const tail = value.split("/node_modules/").at(-1);
      if (tail === value) return null;
      const match = tail.match(/^((?:@[^/]+\/)?[^/]+)\/(.*)$/);
      return match && packages.has(match[1])
        ? { owner: packages.get(match[1]), path: match[2] }
        : null;
    };
    const own = packed(original);
    if (own)
      return relative(root, resolve(root, own.owner, own.path)).replaceAll(
        "\\",
        "/",
      );
    const dist = info.distFile && packed(info.distFile);
    if (dist && !/^\w+:|^\//.test(original))
      return relative(
        root,
        resolve(root, dist.owner, dirname(dist.path), original),
      ).replaceAll("\\", "/");
    return sourcePath(root, path, info);
  };
  const checkMap = (map, distFile) => {
    if (!map || !Array.isArray(map.sources)) return;
    for (const [index, path] of map.sources.entries()) {
      const url = map.sourceRoot
        ? `${map.sourceRoot.replace(/\/$/, "")}/${path}`
        : path;
      const name = normalize(path, { url, distFile });
      if (
        selected.has(name) &&
        map.sourcesContent?.[index] !==
          readFileSync(resolve(root, name), "utf8")
      ) {
        const error = `Source map content does not match checkout: ${name}`;
        mappingErrors.push(error);
        throw new Error(error);
      }
    }
  };
  return {
    name: "Application Node and Chromium coverage",
    baseDir: root,
    outputDir,
    reports: ["lcovonly", "json-summary"],
    sourcePath: normalize,
    sourceFilter: (path) => selected.has(path),
    onEntry: (entry) => checkMap(entry.sourceMap, entry.url),
    sourceMapResolver: async (url, resolver) => {
      const map = await resolver(url);
      checkMap(map, url);
      return map;
    },
    onEnd: () => {
      if (mappingErrors.length) throw new Error(mappingErrors.join("; "));
    },
  };
}

// The tool's own dependencies first; provider packages are resolved from the workspace root.
export function packageVersion(root, name) {
  for (const base of [dirname(fileURLToPath(import.meta.url)), root]) {
    const path = resolve(base, "node_modules", name, "package.json");
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")).version;
  }
  throw new Error(`${name} is not installed`);
}
