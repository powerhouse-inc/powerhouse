import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { ModelManifestEntry } from "../executor/worker/protocol.js";

/** An importable file holding one or more document-model exports. */
export type FileModelSource = { filePath: string; exportName?: string };

/** An importable package specifier holding one or more document-model exports. */
export type PackageModelSource = {
  packageName: string;
  subpath?: string;
  exportName?: string;
};

/**
 * A source of document models: a live module, an importable file, or an
 * importable package. File and package sources can cross a worker-thread
 * boundary (workers re-import them); a live module cannot.
 */
export type DocumentModelSource =
  | DocumentModelModule<any>
  | FileModelSource
  | PackageModelSource;

export type ResolvedModelSources = {
  /** Every resolved module, deduped by `documentType@version`, first wins. */
  modules: DocumentModelModule<any>[];
  /** One entry per model reachable through an importable source. */
  manifest: ModelManifestEntry[];
  /** `documentType@version` keys reachable only through live modules. */
  moduleOnlyKeys: string[];
};

export function modelSourceKey(module: DocumentModelModule<any>): string {
  return `${module.documentModel.global.id}@${module.version ?? 1}`;
}

export function isDocumentModelModule(
  value: unknown,
): value is DocumentModelModule<any> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as {
    documentModel?: { global?: { id?: unknown } };
    reducer?: unknown;
  };
  return (
    typeof candidate.reducer === "function" &&
    typeof candidate.documentModel?.global?.id === "string"
  );
}

type ResolvedEntry = {
  module: DocumentModelModule<any>;
  spec: ModelManifestEntry["spec"] | null;
};

/**
 * Resolves every source to live modules by importing file/package sources
 * host-side and scanning their exports, so the host registry and the worker
 * manifest are derived from one list and cannot diverge.
 */
export async function resolveModelSources(
  sources: DocumentModelSource[],
): Promise<ResolvedModelSources> {
  const resolved = new Map<string, ResolvedEntry>();

  for (const source of sources) {
    if (isDocumentModelModule(source)) {
      addEntry(resolved, { module: source, spec: null });
      continue;
    }
    for (const entry of await resolveImportableSource(source)) {
      addEntry(resolved, entry);
    }
  }

  const modules: DocumentModelModule<any>[] = [];
  const manifest: ModelManifestEntry[] = [];
  const moduleOnlyKeys: string[] = [];
  for (const [key, entry] of resolved) {
    modules.push(entry.module);
    if (entry.spec) {
      manifest.push({
        documentType: entry.module.documentModel.global.id,
        version: String(entry.module.version ?? 1),
        spec: entry.spec,
      });
    } else {
      moduleOnlyKeys.push(key);
    }
  }
  return { modules, manifest, moduleOnlyKeys };
}

// First occurrence wins for the module instance; importability is an OR, so
// a later importable occurrence backfills the spec of a live-module one.
function addEntry(map: Map<string, ResolvedEntry>, entry: ResolvedEntry): void {
  const key = modelSourceKey(entry.module);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, entry);
    return;
  }
  if (!existing.spec && entry.spec) {
    existing.spec = entry.spec;
  }
}

async function resolveImportableSource(
  source: FileModelSource | PackageModelSource,
): Promise<ResolvedEntry[]> {
  const isFile = "filePath" in source;
  const specifier = isFile
    ? new URL(`file://${source.filePath}`).href
    : source.subpath
      ? `${source.packageName}/${source.subpath}`
      : source.packageName;
  const moduleRef = isFile
    ? { filePath: source.filePath }
    : { packageName: specifier };

  let moduleNs: Record<string, unknown>;
  try {
    moduleNs = (await import(/* @vite-ignore */ specifier)) as Record<
      string,
      unknown
    >;
  } catch (error) {
    throw new Error(
      `Failed to import document-model source "${describeSource(source)}"`,
      { cause: error },
    );
  }

  if (source.exportName !== undefined) {
    const value = moduleNs[source.exportName];
    if (!isDocumentModelModule(value)) {
      throw new Error(
        `Export "${source.exportName}" of document-model source "${describeSource(source)}" is not a DocumentModelModule`,
      );
    }
    return [
      {
        module: value,
        spec: { module: { ...moduleRef, exportName: source.exportName } },
      },
    ];
  }

  const entries: ResolvedEntry[] = [];
  for (const [exportName, value] of Object.entries(moduleNs)) {
    if (isDocumentModelModule(value)) {
      entries.push({
        module: value,
        spec: { module: { ...moduleRef, exportName } },
      });
    }
  }
  if (entries.length === 0) {
    throw new Error(
      `Document-model source "${describeSource(source)}" has no DocumentModelModule exports`,
    );
  }
  return entries;
}

function describeSource(source: FileModelSource | PackageModelSource): string {
  return "filePath" in source
    ? source.filePath
    : source.subpath
      ? `${source.packageName}/${source.subpath}`
      : source.packageName;
}
