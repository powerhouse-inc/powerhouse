/** Where a codegen job for one document stands; `done`, `failed` and `skipped` are settled. */
export type CodegenState =
  | "queued"
  | "running"
  | "waiting-for-install"
  | "done"
  | "failed"
  | "skipped";

export const SETTLED_CODEGEN_STATES: readonly CodegenState[] = [
  "done",
  "failed",
  "skipped",
];

export type CodegenStatus = {
  documentId: string;
  documentType: string;
  /** The module's name, once the job has read the document. */
  name?: string;
  state: CodegenState;
  /** Why it was skipped or failed, or what it waits for. */
  message?: string;
  /** Project files the job wrote, relative to the project. */
  files?: string[];
  /** ISO timestamp of the last change. */
  updatedAt: string;
};

/** A package module the reactor failed to load, e.g. broken generated code. */
export type PackageLoadFailure = {
  package: string;
  /** What was loaded: "document models", "subgraphs", "processors", ... */
  kind: string;
  message: string;
  updatedAt: string;
};

export function isSettledCodegenState(state: CodegenState): boolean {
  return SETTLED_CODEGEN_STATES.includes(state);
}

/** Vetra's codegen status per document, and failed package loads. The codegen
 * processor, the package loader and reactor-mcp share it in one process. */
export class CodegenStatusRegistry {
  #documentTypes = new Set<string>();
  #statuses = new Map<string, CodegenStatus>();
  #loadFailures = new Map<string, PackageLoadFailure>();
  #listeners = new Set<() => void>();

  /** Records that a codegen processor generates code for `documentTypes`. */
  watch(documentTypes: readonly string[]): void {
    for (const type of documentTypes) this.#documentTypes.add(type);
    this.#notify();
  }

  /** Whether a codegen processor runs in this process. */
  get active(): boolean {
    return this.#documentTypes.size > 0;
  }

  get documentTypes(): string[] {
    return [...this.#documentTypes];
  }

  watches(documentType: string): boolean {
    return this.#documentTypes.has(documentType);
  }

  /** Replaces a document's status; `name` carries over unless given. */
  set(
    status: Omit<CodegenStatus, "updatedAt" | "name"> & { name?: string },
  ): CodegenStatus {
    const name = status.name ?? this.#statuses.get(status.documentId)?.name;
    const next: CodegenStatus = {
      documentId: status.documentId,
      documentType: status.documentType,
      ...(name !== undefined && { name }),
      state: status.state,
      ...(status.message !== undefined && { message: status.message }),
      ...(status.files !== undefined && { files: status.files }),
      updatedAt: new Date().toISOString(),
    };
    this.#statuses.set(status.documentId, next);
    this.#notify();
    return next;
  }

  get(documentId: string): CodegenStatus | undefined {
    return this.#statuses.get(documentId);
  }

  /** Most recently updated first. */
  list(): CodegenStatus[] {
    return [...this.#statuses.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  delete(documentId: string): void {
    if (this.#statuses.delete(documentId)) this.#notify();
  }

  /** Records a failed load of `kind` from `pkg`; no `failure` clears it. */
  reportLoad(pkg: string, kind: string, failure?: string): void {
    const key = `${pkg}\u0000${kind}`;
    if (failure === undefined) {
      if (this.#loadFailures.delete(key)) this.#notify();
      return;
    }
    this.#loadFailures.set(key, {
      package: pkg,
      kind,
      message: failure,
      updatedAt: new Date().toISOString(),
    });
    this.#notify();
  }

  loadFailures(): PackageLoadFailure[] {
    return [...this.#loadFailures.values()];
  }

  /** Whether `documentId`'s job, or every job when omitted, has settled. */
  settled(documentId?: string): boolean {
    const statuses =
      documentId === undefined
        ? this.list()
        : [this.get(documentId)].filter((s) => s !== undefined);
    return statuses.every((status) => isSettledCodegenState(status.state));
  }

  /** Resolves to whether the jobs settled within `timeoutMs`. */
  waitUntilSettled(
    documentId: string | undefined,
    timeoutMs: number,
  ): Promise<boolean> {
    if (this.settled(documentId)) return Promise.resolve(true);
    return new Promise((resolve) => {
      const finish = (settled: boolean) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(settled);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      const unsubscribe = this.subscribe(() => {
        if (this.settled(documentId)) finish(true);
      });
    });
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Forgets everything; for tests. */
  clear(): void {
    this.#documentTypes.clear();
    this.#statuses.clear();
    this.#loadFailures.clear();
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}

// On globalThis, so two copies of this package in one process share it.
const REGISTRY_KEY = Symbol.for("@powerhousedao/shared/codegen-status");

/** The process's codegen status registry. */
export function getCodegenStatusRegistry(): CodegenStatusRegistry {
  const holder = globalThis as { [REGISTRY_KEY]?: CodegenStatusRegistry };
  return (holder[REGISTRY_KEY] ??= new CodegenStatusRegistry());
}
