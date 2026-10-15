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

/**
 * Validates the selection beside the package's schema-first models and
 * subgraphs, which the server serves with it. A package with no subgraph of
 * either style needs no host, so it passes without one installed.
 */
export function defaultHostValidationFor(
  projectDir: string,
): HostValidationCallback {
  return async (request) => {
    const { readSchemaFirstModels, readSchemaFirstSubgraphs } =
      await import("@powerhousedao/vetra/codegen");
    const subgraphs = readSchemaFirstSubgraphs(projectDir, request.subgraphs);
    if (request.subgraphs.length === 0 && subgraphs.length === 0) {
      return { completed: true, diagnostics: [] };
    }
    const validate = await hostValidationFor(projectDir);
    if (validate === undefined) return { completed: false, diagnostics: [] };
    // `ph generate` reports a model file it cannot read.
    const documentModels = readSchemaFirstModels(projectDir, {
      skipUnreadable: true,
    });
    return validate({ ...request, schemaFirst: { documentModels, subgraphs } });
  };
}
