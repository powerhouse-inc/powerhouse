import {
  BrowserLocalStorage,
  type IDocumentModelLoader,
  type IPackageDiscoveryService,
  type DiscoveryEvent,
  type DiscoveryEventListener,
  type FailedInstallation,
  type FailedInstallationReason,
  type PendingInstallation,
} from "@powerhousedao/reactor-browser";
import type { RegistryClient } from "@powerhousedao/reactor-browser";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { BrowserPackageManager } from "./package-manager.js";

export type DiscoveryMode = "immediate" | "manual";

type DeferredEntry = {
  packageNames: string[];
  resolve: (module: DocumentModelModule<any>) => void;
  reject: (reason: unknown) => void;
  promise: Promise<DocumentModelModule<any>>;
};

export class PackageDiscoveryService
  implements IDocumentModelLoader, IPackageDiscoveryService
{
  #packageManager: BrowserPackageManager;
  #registryClient: RegistryClient;
  #mode: DiscoveryMode;

  #deferred = new Map<string, DeferredEntry>();
  #pending = new Map<string, PendingInstallation>();
  #pendingMemo: PendingInstallation[] = [];
  #pendingSubscribers = new Set<() => void>();
  #failed = new Map<string, FailedInstallation>();
  #failedMemo: FailedInstallation[] = [];
  #failedSubscribers = new Set<() => void>();
  #eventSubscribers = new Set<DiscoveryEventListener>();
  #dismissedStorage: BrowserLocalStorage<boolean>;
  #discoveredTypes = new Map<string, string[]>();

  constructor(
    packageManager: BrowserPackageManager,
    registryClient: RegistryClient,
    options: { mode: DiscoveryMode; storageKey: string },
  ) {
    this.#packageManager = packageManager;
    this.#registryClient = registryClient;
    this.#mode = options.mode;
    this.#dismissedStorage = new BrowserLocalStorage<boolean>(
      options.storageKey + ":PH_DISMISSED_TYPES",
    );
  }

  load(documentType: string): Promise<DocumentModelModule<any>> {
    const existing = this.#findModuleInLoadedPackages(documentType);
    if (existing) {
      this.#clearFailed(documentType);
      return Promise.resolve(existing);
    }

    if (this.#dismissedStorage.has(documentType)) {
      this.#recordFailure(documentType, "dismissed", [], null);
      return Promise.reject(
        new Error(`Document type "${documentType}" was dismissed`),
      );
    }

    const tracked = this.#deferred.get(documentType);
    if (tracked) {
      return tracked.promise;
    }

    return this.#discover(documentType);
  }

  promptInstallation(documentType: string): void {
    const packageNames = this.#discoveredTypes.get(documentType);
    if (!packageNames) return;
    if (this.#pending.has(documentType)) return;

    this.#discoveredTypes.delete(documentType);
    this.#addToPending(documentType, packageNames);
  }

  async approveInstallation(packageName: string): Promise<void> {
    const affectedTypes = this.#findTypesByPackage(packageName);
    if (affectedTypes.length === 0) return;

    const result = await this.#packageManager.addPackage(packageName);
    if (result.type === "error") {
      this.#emitEvent({
        type: "installation-failed",
        packageName,
        error: result.error,
      });
      for (const documentType of affectedTypes) {
        const entry = this.#deferred.get(documentType);
        if (entry) {
          entry.reject(result.error);
          this.#deferred.delete(documentType);
          this.#pending.delete(documentType);
        }
        this.#recordFailure(
          documentType,
          "install-failed",
          [packageName],
          result.error,
        );
      }
      this.#notifyPendingChanged();
      return;
    }

    this.#emitEvent({
      type: "installation-approved",
      packageName,
      documentTypes: affectedTypes,
    });

    for (const documentType of affectedTypes) {
      const entry = this.#deferred.get(documentType);
      if (!entry) continue;

      const module = this.#findModuleInLoadedPackages(documentType);
      if (module) {
        entry.resolve(module);
        this.#clearFailed(documentType);
      } else {
        const error = new Error(
          `Package "${packageName}" installed but module for "${documentType}" not found`,
        );
        entry.reject(error);
        this.#recordFailure(
          documentType,
          "install-failed",
          [packageName],
          error,
        );
      }
      this.#deferred.delete(documentType);
      this.#pending.delete(documentType);
    }
    this.#notifyPendingChanged();
  }

  dismissInstallation(packageName: string): void {
    const affectedTypes = this.#findTypesByPackage(packageName);
    if (affectedTypes.length === 0) return;

    for (const documentType of affectedTypes) {
      this.#dismissedStorage.set(documentType, true);
      const entry = this.#deferred.get(documentType);
      if (entry) {
        entry.reject(
          new Error(`Document type "${documentType}" was dismissed`),
        );
      }
      this.#deferred.delete(documentType);
      this.#pending.delete(documentType);
      this.#discoveredTypes.delete(documentType);
      this.#recordFailure(documentType, "dismissed", [packageName], null);
    }

    this.#emitEvent({
      type: "installation-dismissed",
      packageName,
      documentTypes: affectedTypes,
    });
    this.#notifyPendingChanged();
  }

  getPendingInstallations(): PendingInstallation[] {
    return this.#pendingMemo;
  }

  subscribePending(listener: () => void): () => void {
    this.#pendingSubscribers.add(listener);
    return () => {
      this.#pendingSubscribers.delete(listener);
    };
  }

  getFailedInstallations(): FailedInstallation[] {
    return this.#failedMemo;
  }

  subscribeFailed(listener: () => void): () => void {
    this.#failedSubscribers.add(listener);
    return () => {
      this.#failedSubscribers.delete(listener);
    };
  }

  subscribeEvents(listener: DiscoveryEventListener): () => void {
    this.#eventSubscribers.add(listener);
    return () => {
      this.#eventSubscribers.delete(listener);
    };
  }

  async retryInstallation(documentType: string): Promise<void> {
    this.#dismissedStorage.delete(documentType);
    this.#clearFailed(documentType);
    try {
      await this.#discover(documentType);
    } catch {
      // failure has been recorded via #recordFailure; swallow so the
      // caller (UI button) doesn't have to handle the rejection
    }
  }

  async #discover(documentType: string): Promise<DocumentModelModule<any>> {
    let packageNames: string[];
    try {
      packageNames =
        await this.#registryClient.getPackagesByDocumentType(documentType);
    } catch (error) {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      this.#emitEvent({
        type: "registry-query-failed",
        documentType,
        error: normalized,
      });
      this.#recordFailure(documentType, "registry-error", [], normalized);
      return Promise.reject(normalized);
    }

    if (packageNames.length === 0) {
      this.#recordFailure(documentType, "not-in-registry", [], null);
      return Promise.reject(
        new Error(`No packages found for document type "${documentType}"`),
      );
    }

    const entry = this.#createDeferredEntry(documentType, packageNames);

    this.#emitEvent({
      type: "type-discovered",
      documentType,
      packageNames,
    });

    if (this.#mode === "immediate") {
      this.#addToPending(documentType, packageNames);
    } else {
      this.#discoveredTypes.set(documentType, packageNames);
    }

    return entry.promise;
  }

  #createDeferredEntry(
    documentType: string,
    packageNames: string[],
  ): DeferredEntry {
    let resolve!: (module: DocumentModelModule<any>) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<DocumentModelModule<any>>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const entry: DeferredEntry = { packageNames, resolve, reject, promise };
    this.#deferred.set(documentType, entry);
    return entry;
  }

  #addToPending(documentType: string, packageNames: string[]): void {
    const installation: PendingInstallation = { documentType, packageNames };
    this.#pending.set(documentType, installation);
    this.#emitEvent({
      type: "installation-prompted",
      documentType,
      packageNames,
    });
    this.#notifyPendingChanged();
  }

  #findModuleInLoadedPackages(
    documentType: string,
  ): DocumentModelModule<any> | undefined {
    return this.#packageManager.packages
      .flatMap((p) => p.documentModels)
      .find((m) => m.documentModel.global.id === documentType);
  }

  #findTypesByPackage(packageName: string): string[] {
    const types: string[] = [];
    for (const [documentType, entry] of this.#deferred) {
      if (entry.packageNames.includes(packageName)) {
        types.push(documentType);
      }
    }
    return types;
  }

  #notifyPendingChanged(): void {
    this.#pendingMemo = Array.from(this.#pending.values());
    for (const listener of this.#pendingSubscribers) {
      listener();
    }
  }

  #notifyFailedChanged(): void {
    this.#failedMemo = Array.from(this.#failed.values());
    for (const listener of this.#failedSubscribers) {
      listener();
    }
  }

  #recordFailure(
    documentType: string,
    reason: FailedInstallationReason,
    packageNames: string[],
    error: Error | null,
  ): void {
    this.#failed.set(documentType, {
      documentType,
      reason,
      packageNames,
      error,
    });
    this.#emitEvent({ type: "load-failed", documentType, reason });
    this.#notifyFailedChanged();
  }

  #clearFailed(documentType: string): void {
    if (this.#failed.delete(documentType)) {
      this.#notifyFailedChanged();
    }
  }

  #emitEvent(event: DiscoveryEvent): void {
    for (const listener of this.#eventSubscribers) {
      listener(event);
    }
  }
}
