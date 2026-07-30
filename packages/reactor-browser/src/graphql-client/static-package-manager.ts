import type { DocumentModelSource } from "@powerhousedao/reactor";
import type { RegistryPackageSource } from "@powerhousedao/shared";
import type { DocumentModelLib, DocumentModelModule } from "document-model";
import type {
  IPackageManager,
  IPackageListerUnsubscribe,
  IPackagesListener,
  PackageManagerInstallResult,
} from "../types/vetra.js";

/**
 * A fixed set of packages presented through the `IPackageManager` interface,
 * so the package-derived hooks - `useDocumentModelModules`,
 * `useDocumentModelModuleById`, `useEditorModules`, `useVetraPackages` - work
 * below `GraphQLReactorProvider` exactly as they do below Connect.
 *
 * Connect's package manager installs, updates and removes packages at runtime.
 * A light app instead declares its packages once, as code it imports itself
 * (every generated package root exports `manifest`, `documentModels`, `editors`
 * and `upgradeManifests` by name), so every mutating member throws and
 * `subscribe` never emits. For hand-picked modules without package artifacts,
 * {@link packageFromDocumentModels} wraps them in one synthetic package.
 */
export class StaticPackageManager implements IPackageManager {
  readonly registryUrl = null;
  readonly packages: DocumentModelLib[];

  // DocumentModelLib<any>: a real package's concrete modules are invariant in
  // their state generic, so the boundary needs the same escape the reactor
  // core uses for DocumentModelSource (packages/reactor/src/core/model-sources.ts).
  constructor(packages: readonly DocumentModelLib<any>[]) {
    this.packages = [...packages];
  }

  /**
   * Resolves a module by document type across all packages. Mirrors the
   * registry's semantics (`IDocumentModelRegistry.getModule`): the LATEST
   * version wins, with `version ?? 1` as each module's default.
   */
  load(documentType: string): Promise<DocumentModelSource> {
    let latestModule: DocumentModelModule<any> | undefined;
    let latestVersion = -1;
    for (const pkg of this.packages) {
      for (const module of pkg.documentModels) {
        if (module.documentModel.global.id !== documentType) {
          continue;
        }
        const moduleVersion = module.version ?? 1;
        if (moduleVersion > latestVersion) {
          latestVersion = moduleVersion;
          latestModule = module;
        }
      }
    }
    return latestModule
      ? Promise.resolve(latestModule)
      : Promise.reject(new Error(`Unknown document type: ${documentType}`));
  }

  subscribe(_handler: IPackagesListener): IPackageListerUnsubscribe {
    return () => {};
  }

  getPackageSource(_packageName: string): RegistryPackageSource | null {
    return null;
  }

  getPackageVersion(_packageName: string): string | undefined {
    return undefined;
  }

  getRegistryPackages(): { name: string; version: string | undefined }[] {
    return [];
  }

  addPackage(_packageName: string): PackageManagerInstallResult {
    throw staticPackageManagerError("addPackage");
  }

  addPackages(_packageNames: string[]): PackageManagerInstallResult[] {
    throw staticPackageManagerError("addPackages");
  }

  removePackage(_name: string): void {
    throw staticPackageManagerError("removePackage");
  }

  updateLocalPackage(_pkg: DocumentModelLib, _version?: string): void {
    throw staticPackageManagerError("updateLocalPackage");
  }

  addLocalPackage(
    _name: string,
    _loadedPackage: DocumentModelLib,
    _version?: string,
  ): void {
    throw staticPackageManagerError("addLocalPackage");
  }
}

function staticPackageManagerError(member: string): Error {
  return new Error(
    `${member} is not supported: StaticPackageManager holds a fixed set of packages`,
  );
}

/**
 * Wraps hand-picked modules in one synthetic `DocumentModelLib`, for apps that
 * assemble their model list from mixed sources instead of passing whole
 * packages. The manifest is fabricated - loose modules carry none - so prefer
 * the `packages` prop with the real package exports when you have them: a real
 * package also carries `editors`, which makes the editor hooks work.
 */
export function packageFromDocumentModels(
  documentModels: readonly DocumentModelModule<any>[],
): DocumentModelLib {
  return {
    manifest: {
      name: "graphql-reactor-provider",
      description: "Document models passed to GraphQLReactorProvider",
    },
    documentModels,
    editors: [],
  };
}
