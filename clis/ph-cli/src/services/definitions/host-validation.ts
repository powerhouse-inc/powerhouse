import { REACTOR_API_PACKAGE } from "@powerhousedao/shared/clis/constants";
import type { HostValidationCallback } from "document-model/tooling";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function hostValidationFor(
  projectDir: string,
): Promise<HostValidationCallback | undefined> {
  const entry = hostEntryPoint(projectDir);
  return entry === undefined
    ? Promise.resolve(undefined)
    : import(/* @vite-ignore */ entry).then(
        (host: { validateSubgraphsForHost?: HostValidationCallback }) =>
          host.validateSubgraphsForHost,
        () => undefined,
      );
}

function hostEntryPoint(projectDir: string): string | undefined {
  let directory = resolve(projectDir);
  for (;;) {
    const root = join(directory, "node_modules", REACTOR_API_PACKAGE);
    const manifest = join(root, "package.json");
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, "utf8")) as {
          exports?: { "."?: Record<string, string> | string };
          module?: string;
          main?: string;
        };
        const entry = parsed.exports?.["."];
        const relative =
          typeof entry === "string"
            ? entry
            : (entry?.import ?? entry?.default ?? parsed.module ?? parsed.main);
        if (typeof relative === "string") {
          return pathToFileURL(join(root, relative)).href;
        }
      } catch {
        return undefined;
      }
      return undefined;
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

export function defaultHostValidationFor(
  projectDir: string,
): HostValidationCallback {
  return async (request) => {
    const validate = await hostValidationFor(projectDir);
    return validate === undefined
      ? { completed: false, diagnostics: [] }
      : validate(request);
  };
}
