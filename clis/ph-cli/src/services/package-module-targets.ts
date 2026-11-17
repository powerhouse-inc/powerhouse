import { existsSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type PackageJson, readPackageSync } from "read-pkg";
import { toPosix } from "./project-files.js";

/** Every static alternative, without assuming which runtime conditions apply. */
function alternatives(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(alternatives);
}

/** Extra matching patterns are safe here: targets are protected, never rewritten. */
function matchingTargets(
  mapping: unknown,
  specifier: string,
): { pattern: string; targets: string[] }[] {
  if (mapping === null || typeof mapping !== "object") return [];
  return Object.entries(mapping).flatMap(([pattern, value]) => {
    if (pattern === specifier)
      return [{ pattern, targets: alternatives(value) }];
    const star = pattern.indexOf("*");
    if (star === -1) return [];
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (
      !specifier.startsWith(prefix) ||
      !specifier.endsWith(suffix) ||
      specifier.length < prefix.length + suffix.length
    )
      return [];
    const matched = specifier.slice(
      prefix.length,
      specifier.length - suffix.length,
    );
    return [
      {
        pattern,
        targets: alternatives(value).map((target) =>
          target.replaceAll("*", matched),
        ),
      },
    ];
  });
}

/** Static local targets of observed imports/self-exports in each file's package scope. */
export function packageModuleTargets(projectDir: string) {
  const root = resolve(projectDir);
  const packages = new Map<string, PackageJson | undefined>();
  const imports = (from: string, specifier: string) => {
    const redirects: { from: string; specifier: string }[] = [];
    let dir = dirname(join(root, from));
    for (;;) {
      if (!packages.has(dir)) {
        packages.set(
          dir,
          existsSync(join(dir, "package.json"))
            ? readPackageSync({ cwd: dir, normalize: false })
            : undefined,
        );
      }
      const metadata = packages.get(dir);
      if (metadata !== undefined) {
        const visit = (name: string, active: ReadonlySet<string>): string[] => {
          let matches: ReturnType<typeof matchingTargets> = [];
          if (name.startsWith("#")) {
            matches = matchingTargets(metadata.imports, name);
          } else if (
            typeof metadata.name === "string" &&
            (name === metadata.name || name.startsWith(`${metadata.name}/`))
          ) {
            const subpath = `.${name.slice(metadata.name.length)}`;
            const exports = metadata.exports;
            const subpaths =
              exports !== null &&
              typeof exports === "object" &&
              Object.keys(exports).some((key) => key.startsWith("."));
            matches =
              subpath === "." && !subpaths
                ? [{ pattern: ".", targets: alternatives(exports) }]
                : matchingTargets(exports, subpath);
          }
          return matches.flatMap(({ pattern, targets }) => {
            const key = `${name.startsWith("#") ? "imports" : "exports"}:${pattern}`;
            if (active.has(key)) {
              throw new Error(
                `Package mapping ${pattern} redirects recursively. Remove that redirect before migrating subgraphs.`,
              );
            }
            const next = new Set(active).add(key);
            return targets.flatMap((target) => {
              if (!target.startsWith("./")) {
                if (
                  target.startsWith("#") ||
                  (typeof metadata.name === "string" &&
                    (target === metadata.name ||
                      target.startsWith(`${metadata.name}/`)))
                ) {
                  return visit(target, next);
                }
                redirects.push({
                  from: toPosix(relative(root, join(dir, "package.json"))),
                  specifier: target,
                });
                return [];
              }
              const file = fileURLToPath(
                new URL(target, pathToFileURL(dir + sep)),
              );
              return [toPosix(relative(root, file))];
            });
          });
        };
        return { targets: visit(specifier, new Set()), redirects };
      }
      if (dir === root) return { targets: [], redirects };
      dir = dirname(dir);
    }
  };
  const entries = (file: string, specifier: string): readonly string[] => {
    const targets = new Set<string>();
    for (const dir of new Set([dirname(file), dirname(realpathSync(file))])) {
      if (!packages.has(dir)) {
        packages.set(dir, readPackageSync({ cwd: dir, normalize: false }));
      }
      const metadata = packages.get(dir);
      if (metadata === undefined) continue;
      const paths = [
        "./index.js",
        ...alternatives(metadata.main),
        ...alternatives(metadata["module"]),
        ...alternatives(metadata["browser"]),
        ...alternatives(metadata["jsnext:main"]),
        ...alternatives(metadata["jsnext"]),
      ];
      const exports = metadata.exports;
      const subpaths =
        exports !== null &&
        typeof exports === "object" &&
        Object.keys(exports).some((key) => key.startsWith("."));
      if (!subpaths) paths.push(...alternatives(exports));
      else {
        const parts = specifier.split("/");
        const subpath = parts
          .slice(specifier.startsWith("@") ? 2 : 1)
          .join("/");
        for (const key of new Set([
          ".",
          ...(subpath ? [`./${subpath}`] : []),
        ])) {
          paths.push(
            ...matchingTargets(exports, key).flatMap(({ targets }) => targets),
          );
        }
      }
      for (const target of paths) {
        // Legacy main fields are filesystem paths; URL-based loaders also decode them.
        targets.add(toPosix(relative(root, resolve(dir, target))));
        try {
          const url = new URL(target, pathToFileURL(dir + sep));
          if (url.protocol === "file:") {
            targets.add(toPosix(relative(root, fileURLToPath(url))));
          }
        } catch {
          // A literal filename need not be a valid URL.
        }
      }
    }
    return [...targets];
  };
  return { imports, entries };
}
