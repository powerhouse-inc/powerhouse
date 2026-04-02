import type { PackageInfo } from "@powerhousedao/shared/registry";
import { getPackages, getPackagesByDocumentType } from "./fetchers.js";
import type { PublishEvent } from "./types.js";

function cdnUrlToApiUrl(cdnUrl: string): string {
  return cdnUrl.replace(/\/-\/cdn\/?$/, "");
}
export class RegistryClient {
  readonly apiUrl: string;

  constructor(cdnUrl: string) {
    this.apiUrl = cdnUrlToApiUrl(cdnUrl);
  }

  async getPackages(): Promise<PackageInfo[]> {
    const data = await getPackages(this.apiUrl);
    return data;
  }

  async getPackagesByDocumentType(documentType: string): Promise<string[]> {
    return await getPackagesByDocumentType(this.apiUrl, documentType);
  }

  async searchPackages(query: string): Promise<PackageInfo[]> {
    const packages = await this.getPackages();
    if (!query) return packages;
    const lowerQuery = query.toLowerCase();
    return packages.filter(
      (pkg) =>
        pkg.name.toLowerCase().includes(lowerQuery) ||
        pkg.manifest?.description?.toLowerCase().includes(lowerQuery),
    );
  }

  onPublish(callback: (event: PublishEvent) => void): () => void {
    const eventSource = new EventSource(`${this.apiUrl}/-/events`);

    eventSource.addEventListener("publish", (e: MessageEvent<string>) => {
      const data = JSON.parse(e.data) as PublishEvent;
      callback(data);
    });

    return () => {
      eventSource.close();
    };
  }
}
