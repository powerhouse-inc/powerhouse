import type { DocumentModelModule } from "document-model";
import type {
  IDocumentModelLoader,
  IDocumentModelRegistry,
} from "@powerhousedao/reactor";
import type { IPackageManager } from "../types/vetra.js";
import { RegistryClient } from "../registry/client.js";

export interface PendingInstallation {
  documentType: string;
  packageName: string;
}

export interface DismissedPackage {
  packageName: string;
  documentTypes: string[];
}

export type PendingInstallationsListener = () => void;

interface DeferredAction {
  resolve: (module: DocumentModelModule<any>) => void;
  reject: (error: Error) => void;
}

const DISMISSED_STORAGE_KEY = "ph-connect-dismissed-packages";

function loadDismissedPackages(): DismissedPackage[] {
  try {
    const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DismissedPackage[];
  } catch {
    // ignore
  }
  return [];
}

function persistDismissedPackages(dismissed: DismissedPackage[]): void {
  try {
    localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(dismissed));
  } catch {
    // ignore
  }
}

export class BrowserPackageLoader implements IDocumentModelLoader {
  private readonly packageManager: IPackageManager;
  private readonly registryClient: RegistryClient;
  private readonly registryCdnUrl: string;
  private documentModelRegistry?: IDocumentModelRegistry;
  private pending: PendingInstallation[] = [];
  private dismissed: DismissedPackage[] = loadDismissedPackages();
  private deferredActions: Map<string, DeferredAction> = new Map();
  private listeners: Set<PendingInstallationsListener> = new Set();

  constructor(packageManager: IPackageManager, registryCdnUrl: string) {
    this.packageManager = packageManager;
    this.registryCdnUrl = registryCdnUrl;
    this.registryClient = new RegistryClient(registryCdnUrl);
  }

  setDocumentModelRegistry(registry: IDocumentModelRegistry): void {
    this.documentModelRegistry = registry;
  }

  async load(documentType: string): Promise<DocumentModelModule<any>> {
    const packageNames =
      await this.registryClient.getPackagesByDocumentType(documentType);

    if (packageNames.length === 0) {
      throw new Error(
        `No package found containing document type: ${documentType}`,
      );
    }

    const packageName = packageNames.sort((a, b) => a.localeCompare(b))[0];

    this.pending = [...this.pending, { documentType, packageName }];
    this.notifyListeners();

    return new Promise<DocumentModelModule<any>>((resolve, reject) => {
      this.deferredActions.set(packageName, { resolve, reject });
    });
  }

  async approveInstallation(packageName: string): Promise<void> {
    const deferred = this.deferredActions.get(packageName);
    if (!deferred) return;

    try {
      await this.packageManager.addPackage(packageName, this.registryCdnUrl);
    } catch (error) {
      this.removePending(packageName);
      this.deferredActions.delete(packageName);
      deferred.reject(
        error instanceof Error
          ? error
          : new Error(`Failed to install package: ${packageName}`),
      );
      return;
    }

    const pendingEntries = this.pending.filter(
      (p) => p.packageName === packageName,
    );

    this.removePending(packageName);
    this.deferredActions.delete(packageName);

    if (!this.documentModelRegistry) {
      deferred.reject(new Error("Document model registry not available"));
      return;
    }

    for (const entry of pendingEntries) {
      try {
        const module = this.documentModelRegistry.getModule(entry.documentType);
        deferred.resolve(module);
        return;
      } catch {
        // module not found for this type, continue
      }
    }

    deferred.reject(
      new Error(`Module not found after installing package: ${packageName}`),
    );
  }

  rejectInstallation(packageName: string): void {
    const deferred = this.deferredActions.get(packageName);
    if (!deferred) return;

    const rejectedEntries = this.pending.filter(
      (p) => p.packageName === packageName,
    );
    const documentTypes = rejectedEntries.map((e) => e.documentType);

    this.addDismissed(packageName, documentTypes);
    this.removePending(packageName);
    this.deferredActions.delete(packageName);
    deferred.reject(
      new Error(`Installation rejected for package: ${packageName}`),
    );
  }

  subscribe(listener: PendingInstallationsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getPendingInstallations(): PendingInstallation[] {
    return this.pending;
  }

  getDismissedPackages(): DismissedPackage[] {
    return this.dismissed;
  }

  removeDismissed(packageName: string): void {
    this.dismissed = this.dismissed.filter(
      (d) => d.packageName !== packageName,
    );
    persistDismissedPackages(this.dismissed);
    this.notifyListeners();
  }

  private addDismissed(packageName: string, documentTypes: string[]): void {
    const existing = this.dismissed.find((d) => d.packageName === packageName);
    if (existing) {
      const merged = new Set([...existing.documentTypes, ...documentTypes]);
      existing.documentTypes = [...merged];
    } else {
      this.dismissed = [...this.dismissed, { packageName, documentTypes }];
    }
    persistDismissedPackages(this.dismissed);
  }

  private removePending(packageName: string): void {
    this.pending = this.pending.filter((p) => p.packageName !== packageName);
    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
