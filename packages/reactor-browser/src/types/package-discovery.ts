import type { DocumentModelModule } from "@powerhousedao/shared/document-model";

export type PendingInstallation = {
  documentType: string;
  packageNames: string[];
};

export type FailedInstallationReason =
  | "no-registry"
  | "not-in-registry"
  | "registry-error"
  | "install-failed"
  | "dismissed"
  | "offline";

export type FailedInstallation = {
  documentType: string;
  reason: FailedInstallationReason;
  packageNames: string[];
  error: Error | null;
};

export type DiscoveryEvent =
  | { type: "type-discovered"; documentType: string; packageNames: string[] }
  | {
      type: "installation-prompted";
      documentType: string;
      packageNames: string[];
    }
  | {
      type: "installation-approved";
      packageName: string;
      documentTypes: string[];
    }
  | {
      type: "installation-dismissed";
      packageName: string;
      documentTypes: string[];
    }
  | { type: "installation-failed"; packageName: string; error: Error }
  | { type: "registry-query-failed"; documentType: string; error: Error }
  | {
      type: "load-failed";
      documentType: string;
      reason: FailedInstallationReason;
    };

export type DiscoveryEventListener = (event: DiscoveryEvent) => void;

export interface IPackageDiscoveryService {
  load(documentType: string): Promise<DocumentModelModule<any>>;
  getPendingInstallations(): PendingInstallation[];
  subscribePending(listener: () => void): () => void;
  getFailedInstallations(): FailedInstallation[];
  subscribeFailed(listener: () => void): () => void;
  subscribeEvents(listener: DiscoveryEventListener): () => void;
  approveInstallation(packageName: string): Promise<void>;
  dismissInstallation(packageName: string): void;
  promptInstallation(documentType: string): void;
  retryInstallation(documentType: string): Promise<void>;
}
