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

function mapPackageInfo(pkg: PackageInfoFromApi): RegistryPackageInfo {
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
    const res = await fetch(`${this.apiUrl}/packages`);
    if (!res.ok) throw new Error(`Registry error: HTTP ${res.status}`);
    const data = (await res.json()) as PackageInfoFromApi[];
    return data.map(mapPackageInfo);
  }

  async getPackagesByDocumentType(documentType: string): Promise<string[]> {
    const encodedType = encodeURIComponent(documentType);
    const res = await fetch(
      `${this.apiUrl}/packages/by-document-type?type=${encodedType}`,
    );
    if (!res.ok) throw new Error(`Registry error: HTTP ${res.status}`);
    return (await res.json()) as string[];
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
