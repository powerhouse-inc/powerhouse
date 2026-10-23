import type { IDocumentModelRegistry } from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";

type RegistryPackage = { name: string; version: string | undefined };

/** The spec the worker loads a registry package by: `name@version`, or the bare name. */
export function registryPackageSpec(pkg: RegistryPackage): string {
  return pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name;
}

/** Calls `onChange` with the specs of registry packages added or re-versioned since subscribing. */
export function subscribeRegistryPackageChanges(
  manager: {
    getRegistryPackages(): RegistryPackage[];
    subscribe(handler: () => void): () => void;
  },
  onChange: (specs: string[]) => void,
): () => void {
  const sent = new Map(
    manager.getRegistryPackages().map((pkg) => [pkg.name, pkg.version]),
  );
  return manager.subscribe(() => {
    const changed = manager
      .getRegistryPackages()
      .filter(
        (pkg) => !sent.has(pkg.name) || sent.get(pkg.name) !== pkg.version,
      );
    if (changed.length === 0) return;
    for (const pkg of changed) sent.set(pkg.name, pkg.version);
    onChange(changed.map(registryPackageSpec));
  });
}

function typeOf(module: DocumentModelModule): string {
  return module.documentModel.global.id;
}

function keyOf(module: DocumentModelModule): string {
  return `${typeOf(module)}@${module.version ?? 1}`;
}

/** Adds the models the registry lacks, and replaces each type whose modules a package update swapped. */
export function syncRegistryModels(
  registry: Pick<
    IDocumentModelRegistry,
    "getAllModules" | "registerModules" | "unregisterModules"
  >,
  models: DocumentModelModule[],
): void {
  const current = new Map(registry.getAllModules().map((m) => [keyOf(m), m]));
  const replaced = new Set(
    models
      .filter((m) => current.has(keyOf(m)) && current.get(keyOf(m)) !== m)
      .map(typeOf),
  );
  if (replaced.size > 0) registry.unregisterModules(...replaced);
  const fresh = models.filter(
    (m) => replaced.has(typeOf(m)) || !current.has(keyOf(m)),
  );
  if (fresh.length > 0) registry.registerModules(...fresh);
}
