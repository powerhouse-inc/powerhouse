import type { PackageInfo } from "@powerhousedao/shared/registry";
import { getPackages, getPackagesByDocumentType } from "./fetchers.js";
import type { RegistryPackageInfo } from "./types.js";

interface PackageInfoFromApi {
  name: string;
  manifest?: {
    description?: string;
    version?: string;
    category?: string;
    publisher?: {
      name?: string;
      url?: string;
    };
  };
}

function cdnUrlToApiUrl(cdnUrl: string): string {
  return cdnUrl.replace(/\/-\/cdn\/?$/, "");
}

function mapPackageInfo(pkg: PackageInfo): RegistryPackageInfo {
  return {
    name: pkg.name,
    description: pkg.manifest?.description,
    version: pkg.manifest?.version,
    category: pkg.manifest?.category,
    publisher: pkg.manifest?.publisher?.name,
    publisherUrl: pkg.manifest?.publisher?.url,
  };
}

export class RegistryClient {
  readonly apiUrl: string;

  constructor(cdnUrl: string) {
    this.apiUrl = cdnUrlToApiUrl(cdnUrl);
  }

  async getPackages(): Promise<RegistryPackageInfo[]> {
    const data = await getPackages(this.apiUrl);
    return data.map(mapPackageInfo);
  }

  async getPackagesByDocumentType(documentType: string): Promise<string[]> {
    return await getPackagesByDocumentType(this.apiUrl, documentType);
  }

  async searchPackages(query: string): Promise<RegistryPackageInfo[]> {
    const packages = await this.getPackages();
    if (!query) return packages;
    const lowerQuery = query.toLowerCase();
    return packages.filter(
      (pkg) =>
        pkg.name.toLowerCase().includes(lowerQuery) ||
        pkg.description?.toLowerCase().includes(lowerQuery),
    );
  }
}
