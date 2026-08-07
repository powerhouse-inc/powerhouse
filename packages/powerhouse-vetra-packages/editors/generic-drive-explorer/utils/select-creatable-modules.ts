import type { DocumentModelModule } from "@powerhousedao/shared/document-model";

/**
 * The modules a user may pick from when creating a new document. Outside
 * studio mode only the latest version of each document type is offered: new
 * documents should never start on an outdated schema. Builders testing
 * migrations run in studio mode and still get every version.
 */
export function selectCreatableModules(
  modules: readonly DocumentModelModule[],
  studioMode: boolean,
): DocumentModelModule[] {
  if (studioMode) return [...modules];
  const latestByType = new Map<string, DocumentModelModule>();
  for (const module of modules) {
    const id = module.documentModel.global.id;
    const current = latestByType.get(id);
    if (!current || (module.version ?? 1) > (current.version ?? 1)) {
      latestByType.set(id, module);
    }
  }
  return [...latestByType.values()];
}
