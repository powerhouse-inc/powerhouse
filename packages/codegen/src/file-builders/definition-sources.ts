import { POWERHOUSE_CONFIG_FILE } from "@powerhousedao/shared/clis";
import {
  DEFINITION_SOURCES_FORMAT_VERSION,
  type DefinitionSource,
  parseDefinitionSourcesConfig,
} from "@powerhousedao/shared/clis/definition-sources";
import {
  formatDefinitionDiagnostic,
  resolveDefinitionSelection,
} from "document-model/tooling";
import { loadJsonFile } from "load-json-file";
import { join } from "node:path";
import { writeJsonFile } from "write-json-file";
import type { CodeFirstGenerationResult } from "./types.js";

function isSameSource(left: DefinitionSource, right: DefinitionSource) {
  return (
    left.specifier === right.specifier &&
    JSON.stringify(left.exportPath ?? []) ===
      JSON.stringify(right.exportPath ?? [])
  );
}

/**
 * Checks that `source` can be added to the package's code-first
 * `definitionSources`, replacing an absent or schema-first selection, and
 * returns the write as `commit`. Existing entries are written back as they
 * were read. Throws, before anything is written, when the config cannot be
 * merged.
 */
export async function planDefinitionSourceRegistration(
  projectDir: string,
  source: DefinitionSource,
): Promise<{
  registration: CodeFirstGenerationResult["registration"];
  commit: () => Promise<void>;
}> {
  const configFile = join(projectDir, POWERHOUSE_CONFIG_FILE);
  const config = await loadJsonFile(configFile);
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`${configFile} must hold a JSON object.`);
  }

  const existing = parseDefinitionSourcesConfig(config.definitionSources);
  let registration: Exclude<
    CodeFirstGenerationResult["registration"],
    "unchanged"
  >;
  let entries: readonly unknown[] = [source];
  if (existing.ok && existing.mode === "code-first") {
    const { status, diagnostics, sourceSet } = resolveDefinitionSelection({
      configFile,
    });
    if (status === "failed") {
      throw new Error(
        [
          `${configFile} has a definition source this release cannot read:`,
          ...diagnostics.map(formatDefinitionDiagnostic),
        ].join("\n"),
      );
    }
    if (sourceSet.sources.some((entry) => isSameSource(entry, source))) {
      return { registration: "unchanged", commit: () => Promise.resolve() };
    }
    registration = "added";
    entries = [...existing.entries, source];
  } else if (existing.ok) {
    registration = "converted";
  } else if (existing.reason === "missing") {
    registration = "created";
  } else if (existing.reason === "empty") {
    registration = "added";
  } else if (existing.reason === "unsupported-version") {
    throw new Error(
      `${configFile} declares definitionSources.formatVersion ${String(existing.received)}, and this release writes ${DEFINITION_SOURCES_FORMAT_VERSION}. Change the field by hand.`,
    );
  } else {
    throw new Error(
      `${configFile} has an invalid ${existing.path.join(".")}: expected ${existing.expected}. Fix or remove it, then generate again.`,
    );
  }

  const next = {
    ...config,
    definitionSources: {
      formatVersion: DEFINITION_SOURCES_FORMAT_VERSION,
      mode: "code-first",
      entries,
    },
  };
  return {
    registration,
    commit: () => writeJsonFile(configFile, next, { detectIndent: true }),
  };
}
