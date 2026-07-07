import type { IDocumentModelLoader } from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { RegistryClient } from "../registry/client.js";

export type PackageImporter = (url: string) => Promise<Record<string, unknown>>;

export type WorkerPackageLoaderOptions = {
  cdnUrl: string;
  importPackage: PackageImporter;
  resolvePackages?: (documentType: string) => Promise<string[]>;
};

export type PackageLoadFailure = {
  name: string;
  url: string;
  error: unknown;
};

function packageName(spec: string): string {
  const at = spec.lastIndexOf("@");
  return at > 0 ? spec.slice(0, at) : spec;
}

function isDocumentModelModule(value: unknown): value is DocumentModelModule {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as {
    reducer?: unknown;
    documentModel?: { global?: { id?: unknown } };
  };
  return (
    typeof candidate.reducer === "function" &&
    typeof candidate.documentModel?.global?.id === "string"
  );
}

export class WorkerPackageLoader implements IDocumentModelLoader {
  private readonly cdnUrl: string;
  private readonly importPackage: PackageImporter;
  private readonly resolvePackages: (documentType: string) => Promise<string[]>;
  private readonly modulesByType = new Map<string, DocumentModelModule>();
  private readonly loadedSpecs = new Set<string>();
  private readonly failures: PackageLoadFailure[] = [];

  constructor(options: WorkerPackageLoaderOptions) {
    this.cdnUrl = options.cdnUrl.replace(/\/$/, "");
    this.importPackage = options.importPackage;
    const registryClient = new RegistryClient(options.cdnUrl);
    this.resolvePackages =
      options.resolvePackages ??
      ((documentType) =>
        registryClient.getPackagesByDocumentType(documentType));
  }

  async loadPackages(specs: string[]): Promise<DocumentModelModule[]> {
    await Promise.all(
      [...new Set(specs)].map((spec) => this.loadPackage(spec)),
    );
    return this.models;
  }

  // On a miss, discover the package(s) for the type and import them on demand.
  async load(documentType: string): Promise<DocumentModelModule> {
    const existing = this.modulesByType.get(documentType);
    if (existing) {
      return existing;
    }
    const packageNames = await this.resolvePackages(documentType);
    const failuresBefore = this.failures.length;
    await Promise.all(
      [...new Set(packageNames)].map((name) => this.loadPackage(name)),
    );
    const loaded = this.modulesByType.get(documentType);
    if (loaded) {
      return loaded;
    }
    throw this.notLoadedError(
      documentType,
      packageNames,
      this.failures.slice(failuresBefore),
    );
  }

  get models(): DocumentModelModule[] {
    return [...new Set(this.modulesByType.values())];
  }

  get loadFailures(): PackageLoadFailure[] {
    return [...this.failures];
  }

  private notLoadedError(
    documentType: string,
    packageNames: string[],
    failures: PackageLoadFailure[],
  ): Error {
    if (packageNames.length === 0) {
      return new Error(`No package found for document model: ${documentType}`);
    }
    if (failures.length === 0) {
      return new Error(
        `Imported [${packageNames.join(", ")}] but document model not found: ${documentType}`,
      );
    }
    const cause =
      failures.length === 1
        ? failures[0].error
        : new AggregateError(failures.map((failure) => failure.error));
    return new Error(
      `Failed to import package(s) [${packageNames.join(", ")}] for document model: ${documentType}`,
      { cause },
    );
  }

  private async loadPackage(spec: string): Promise<void> {
    if (this.loadedSpecs.has(spec)) {
      return;
    }
    const name = packageName(spec);
    const url = `${this.cdnUrl}/${name}/browser/document-models/index.js`;
    try {
      const namespace = await this.importPackage(url);
      for (const value of Object.values(namespace)) {
        if (isDocumentModelModule(value)) {
          this.modulesByType.set(value.documentModel.global.id, value);
        }
      }
      this.loadedSpecs.add(spec);
    } catch (error) {
      this.failures.push({ name, url, error });
    }
  }
}
