import {
  type IDocumentModelLoader,
  type IPackageDiscoveryService,
  type DiscoveryEvent,
  type DiscoveryEventListener,
  type FailedInstallation,
  type PendingInstallation,
} from "@powerhousedao/reactor-browser";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { BrowserPackageManager } from "./package-manager.js";

/**
 * Discovery service used when no package registry is configured. Every load
 * for an unknown document type is recorded as a failure with reason
 * "no-registry" so the UI can surface the issue; the modal install flow is a
 * no-op because there is no registry to query.
 */
export class NoRegistryDiscoveryService
  implements IDocumentModelLoader, IPackageDiscoveryService
{
  #packageManager: BrowserPackageManager;
  #failed = new Map<string, FailedInstallation>();
  #failedMemo: FailedInstallation[] = [];
  #failedSubscribers = new Set<() => void>();
  #eventSubscribers = new Set<DiscoveryEventListener>();

  constructor(packageManager: BrowserPackageManager) {
    this.#packageManager = packageManager;
  }

  load(documentType: string): Promise<DocumentModelModule<any>> {
    const existing = this.#findModuleInLoadedPackages(documentType);
    if (existing) {
      this.#clearFailed(documentType);
      return Promise.resolve(existing);
    }

    this.#recordFailure(documentType);
    return Promise.reject(
      new Error(
        `No package registry configured; cannot resolve "${documentType}"`,
      ),
    );
  }

  promptInstallation(): void {
    // no registry to query — nothing to prompt
  }

  approveInstallation(): Promise<void> {
    return Promise.resolve();
  }

  dismissInstallation(): void {
    // nothing to dismiss
  }

  getPendingInstallations(): PendingInstallation[] {
    return [];
  }

  subscribePending(): () => void {
    return () => {};
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

  retryInstallation(documentType: string): Promise<void> {
    // Retry is a no-op without a registry, but re-emitting the failure lets
    // a UI that cleared the row know the underlying condition still holds.
    this.#recordFailure(documentType);
    return Promise.resolve();
  }

  #findModuleInLoadedPackages(
    documentType: string,
  ): DocumentModelModule<any> | undefined {
    return this.#packageManager.packages
      .flatMap((p) => p.documentModels)
      .find((m) => m.documentModel.global.id === documentType);
  }

  #recordFailure(documentType: string): void {
    this.#failed.set(documentType, {
      documentType,
      reason: "no-registry",
      packageNames: [],
      error: null,
    });
    this.#emitEvent({
      type: "load-failed",
      documentType,
      reason: "no-registry",
    });
    this.#notifyFailedChanged();
  }

  #clearFailed(documentType: string): void {
    if (this.#failed.delete(documentType)) {
      this.#notifyFailedChanged();
    }
  }

  #notifyFailedChanged(): void {
    this.#failedMemo = Array.from(this.#failed.values());
    for (const listener of this.#failedSubscribers) {
      listener();
    }
  }

  #emitEvent(event: DiscoveryEvent): void {
    for (const listener of this.#eventSubscribers) {
      listener(event);
    }
  }
}
