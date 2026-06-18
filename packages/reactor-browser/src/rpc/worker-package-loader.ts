import type { IDocumentModelLoader } from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";

export type PackageImporter = (url: string) => Promise<Record<string, unknown>>;

export type WorkerPackageLoaderOptions = {
  cdnUrl: string;
  importPackage: PackageImporter;
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
  private readonly modulesByType = new Map<string, DocumentModelModule>();
  private readonly failures: PackageLoadFailure[] = [];

  constructor(options: WorkerPackageLoaderOptions) {
    this.cdnUrl = options.cdnUrl.replace(/\/$/, "");
    this.importPackage = options.importPackage;
  }

  async loadPackages(specs: string[]): Promise<DocumentModelModule[]> {
    for (const spec of specs) {
      await this.loadPackage(spec);
    }
    return this.models;
  }

  load(documentType: string): Promise<DocumentModelModule> {
    const module = this.modulesByType.get(documentType);
    if (!module) {
      return Promise.reject(
        new Error(`Document model not loaded: ${documentType}`),
      );
    }
    return Promise.resolve(module);
  }

  get models(): DocumentModelModule[] {
    return [...new Set(this.modulesByType.values())];
  }

  get loadFailures(): PackageLoadFailure[] {
    return [...this.failures];
  }

  private async loadPackage(spec: string): Promise<void> {
    const name = packageName(spec);
    const url = `${this.cdnUrl}/${name}/browser/document-models/index.js`;
    try {
      const namespace = await this.importPackage(url);
      for (const value of Object.values(namespace)) {
        if (isDocumentModelModule(value)) {
          this.modulesByType.set(value.documentModel.global.id, value);
        }
      }
    } catch (error) {
      this.failures.push({ name, url, error });
    }
  }
}
