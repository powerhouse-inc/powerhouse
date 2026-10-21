import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { toPosixPath } from "./package-revision.js";
import { canonicalPath } from "./paths.js";

export function filesIn(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((file) => statSync(join(root, file)).isFile())
    .map(toPosixPath)
    .sort();
}

export function relocateSourceMaps(
  candidateRoot: string,
  outputRoot: string,
): void {
  for (const file of filesIn(candidateRoot)) {
    if (!file.endsWith(".map")) continue;
    const path = join(candidateRoot, file);
    writeFileSync(
      path,
      relocateSourceMap(
        readFileSync(path, "utf8"),
        dirname(path),
        dirname(join(outputRoot, file)),
      ),
    );
  }
}

export function relocateSourceMap(
  text: string,
  writtenIn: string,
  servedFrom: string,
): string {
  const map = JSON.parse(text) as { sources?: unknown; sourceRoot?: unknown };
  const sourceRoot = typeof map.sourceRoot === "string" ? map.sourceRoot : "";
  const isUrl = (path: string): boolean =>
    !isAbsolute(path) && /^[a-z][a-z\d+.-]*:/i.test(path);
  if (!Array.isArray(map.sources) || isUrl(sourceRoot)) {
    return text;
  }
  return JSON.stringify({
    ...map,
    sourceRoot: "",
    sources: map.sources.map((source: unknown) =>
      typeof source === "string" && !isUrl(source)
        ? toPosixPath(
            relative(
              servedFrom,
              canonicalPath(resolve(writtenIn, sourceRoot, source)),
            ),
          )
        : source,
    ),
  });
}
