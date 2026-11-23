import type { DocumentModelModule } from "@powerhousedao/shared/document-model";

// A `document-models` barrel also re-exports types, schemas and helpers; keep
// only the entries that are document-model modules.
export function toDocumentModelModules(
  candidates: unknown[],
): DocumentModelModule[] {
  return candidates.filter(
    (m): m is DocumentModelModule =>
      typeof m === "object" &&
      m !== null &&
      "documentModel" in m &&
      "reducer" in m,
  );
}

/** Which of the bundled-but-optional packages this worker registers. */
export type BundledModelFlags = {
  /** Powerhouse workflows: the workflow + connection document models. */
  workflowsEnabled?: boolean;
};

export type BundledModelLoaders = {
  workflow: () => Promise<Record<string, unknown>>;
};

// The package is not CDN-loadable, so it cannot ride the `packageSpecs` path;
// it is a chunk fetched only when its flag is on.
export const defaultBundledModelLoaders: BundledModelLoaders = {
  workflow: () => import("@powerhousedao/workflow/document-models"),
};

export async function loadFlaggedDocumentModels(
  flags: BundledModelFlags,
  loaders: BundledModelLoaders = defaultBundledModelLoaders,
): Promise<DocumentModelModule[]> {
  const models: DocumentModelModule[] = [];
  if (flags.workflowsEnabled) {
    models.push(
      ...toDocumentModelModules(Object.values(await loaders.workflow())),
    );
  }
  return models;
}
