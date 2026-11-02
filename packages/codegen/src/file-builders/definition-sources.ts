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
import { isDeepEqual, isPlainObject } from "remeda";
import { writeJsonFile } from "write-json-file";

/** @experimental How `definitionSources` changes when a scaffold registers its source. */
export type DefinitionSourceRegistration =
  | "created"
  | "converted"
  | "added"
  | "unchanged";

export async function planDefinitionSourceRegistration(
  projectDir: string,
  source: DefinitionSource,
): Promise<{
  registration: DefinitionSourceRegistration;
  commit: () => Promise<void>;
}> {
  const configFile = join(projectDir, POWERHOUSE_CONFIG_FILE);
  const config = await loadJsonFile(configFile);
  if (!isPlainObject(config)) {
    throw new Error(`${configFile} must hold a JSON object.`);
  }

  const existing = parseDefinitionSourcesConfig(config.definitionSources);
  let registration: DefinitionSourceRegistration;
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

function isSameSource(left: DefinitionSource, right: DefinitionSource) {
  return (
    left.specifier === right.specifier &&
    isDeepEqual(left.exportPath ?? [], right.exportPath ?? [])
  );
}
