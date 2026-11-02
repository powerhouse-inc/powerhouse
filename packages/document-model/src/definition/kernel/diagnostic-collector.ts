import type {
  DefinitionDiagnostic,
  DefinitionRef,
} from "@powerhousedao/shared/document-model";
import {
  type DefinitionDiagnosticInput,
  DefinitionError,
  type DiagnosticCatalog,
  type DiagnosticCode,
  sortDefinitionDiagnostics,
} from "./diagnostics.js";

export class DefinitionDiagnosticCollector<TCode extends DiagnosticCode> {
  readonly #catalog: DiagnosticCatalog<TCode>;
  readonly #definition: DefinitionRef | undefined;
  readonly #diagnostics: DefinitionDiagnostic[] = [];

  constructor(catalog: DiagnosticCatalog<TCode>, definition?: DefinitionRef) {
    this.#catalog = catalog;
    this.#definition = definition;
  }

  get diagnostics(): readonly DefinitionDiagnostic[] {
    return sortDefinitionDiagnostics(this.#diagnostics);
  }

  add(input: DefinitionDiagnosticInput<TCode>): void {
    this.#diagnostics.push(
      this.#catalog.create({
        ...(this.#definition !== undefined && { definition: this.#definition }),
        ...input,
      }),
    );
  }

  merge(diagnostics: readonly DefinitionDiagnostic[]): void {
    for (const diagnostic of diagnostics) {
      this.#diagnostics.push(
        this.#definition === undefined || diagnostic.definition !== undefined
          ? diagnostic
          : { ...diagnostic, definition: { ...this.#definition } },
      );
    }
  }

  capture<T>(attempt: () => T): T | undefined {
    try {
      return attempt();
    } catch (error) {
      if (!(error instanceof DefinitionError)) throw error;
      this.merge(error.diagnostics);
      return undefined;
    }
  }

  throwIfFailed(): void {
    if (!this.#diagnostics.some((entry) => entry.severity === "error")) return;
    throw new DefinitionError(
      this.#diagnostics as [DefinitionDiagnostic, ...DefinitionDiagnostic[]],
    );
  }
}
