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
  /** Builder mode: vetra's spec document models. */
  studioMode?: boolean;
  /** Powerhouse workflows: the workflow + connection document models. */
  workflowsEnabled?: boolean;
};

export type BundledModelLoaders = {
  vetra: () => Promise<Record<string, unknown>>;
  workflow: () => Promise<Record<string, unknown>>;
};

// Neither package is CDN-loadable, so neither can ride the `packageSpecs`
// path; each is a chunk fetched only when its own flag is on.
export const defaultBundledModelLoaders: BundledModelLoaders = {
  vetra: () => import("@powerhousedao/vetra/document-models"),
  workflow: () => import("@powerhousedao/workflow/document-models"),
};

// The flags are independent: studio mode does not imply workflows, nor the
// other way round.
export async function loadFlaggedDocumentModels(
  flags: BundledModelFlags,
  loaders: BundledModelLoaders = defaultBundledModelLoaders,
): Promise<DocumentModelModule[]> {
  const models: DocumentModelModule[] = [];
  if (flags.studioMode) {
    models.push(
      ...toDocumentModelModules(Object.values(await loaders.vetra())),
    );
  }
  if (flags.workflowsEnabled) {
    models.push(
      ...toDocumentModelModules(Object.values(await loaders.workflow())),
    );
  }
  return models;
}
