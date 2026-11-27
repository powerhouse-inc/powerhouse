import type { ProjectDocumentModel, ProjectSubgraph } from "../api.js";
import { documentModelPrompt, subgraphPrompt } from "./legacy-prompts.js";

type ModuleOfAnyKind =
  | { kind: "document-model"; module: ProjectDocumentModel }
  | { kind: "subgraph"; module: ProjectSubgraph }
  | { kind: "editor" | "app" | "processor" };

export type LegacyMigration = {
  command: (options?: { dryRun: boolean }) => string;
  agentPrompt: string;
};

export type Legacy = {
  title: "Legacy document model" | "Legacy subgraph";
  migration: LegacyMigration;
};

const directoryName = (folder: string) =>
  folder.slice(folder.lastIndexOf("/") + 1);

function migrateCommand(
  flag: string,
  folder: string,
): LegacyMigration["command"] {
  const base = `ph migrate ${flag} ${directoryName(folder)}`;
  return (options) => (options?.dryRun ? `${base} --dry-run` : base);
}

function documentModelMigration(model: ProjectDocumentModel): LegacyMigration {
  const command = migrateCommand("--document-model", model.folder);
  return {
    command,
    agentPrompt: documentModelPrompt({
      folder: model.folder,
      type: model.documentType,
      command: command(),
    }),
  };
}

function subgraphMigration(subgraph: ProjectSubgraph): LegacyMigration {
  const command = migrateCommand("--subgraph", subgraph.folder);
  return {
    command,
    agentPrompt: subgraphPrompt({
      folder: subgraph.folder,
      command: command(),
    }),
  };
}

export function legacyOf(entry: ModuleOfAnyKind): Legacy | undefined {
  if (entry.kind === "document-model" && entry.module.authoring === "legacy") {
    return {
      title: "Legacy document model",
      migration: documentModelMigration(entry.module),
    };
  }
  if (entry.kind === "subgraph" && entry.module.authoring === "legacy") {
    return {
      title: "Legacy subgraph",
      migration: subgraphMigration(entry.module),
    };
  }
  return undefined;
}

export const countLegacy = (entries: readonly ModuleOfAnyKind[]) =>
  entries.filter((entry) => legacyOf(entry) !== undefined).length;
