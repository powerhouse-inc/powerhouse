import type { Project } from "ts-morph";
import type {
  CodegenInput,
  CodegenJob,
  Config,
  GenerateResult,
} from "./types.js";

/** The base of the generators, one per document type or set of types. */
export abstract class BaseDocumentGen {
  /** The document type or types this generator handles. */
  abstract readonly supportedDocumentTypes: string | string[];
  project: Project;

  constructor(
    protected config: Config,
    project: Project,
  ) {
    this.project = project;
  }

  /** Generates code for the document; throws when generation fails. */
  abstract generate(
    strand: CodegenInput,
    job?: CodegenJob,
  ): Promise<GenerateResult>;

  supportsDocumentType(documentType: string): boolean {
    if (typeof this.supportedDocumentTypes === "string") {
      return this.supportedDocumentTypes === documentType;
    }
    return this.supportedDocumentTypes.includes(documentType);
  }

  getSupportedDocumentTypes(): string[] {
    if (typeof this.supportedDocumentTypes === "string") {
      return [this.supportedDocumentTypes];
    }
    return [...this.supportedDocumentTypes];
  }

  /** The module's name in the strand's state, for its codegen status. */
  moduleName(strand: CodegenInput): string | undefined {
    const state = strand.state as { global?: { name?: unknown } } | undefined;
    const name = state?.global?.name;
    return typeof name === "string" && name !== "" ? name : undefined;
  }

  /** Why this strand is not generated from; undefined when it is. */
  skipReason(strand: CodegenInput): string | undefined {
    if (!strand.documentId || !strand.documentType) {
      return "The operation names no document";
    }
    if (!this.supportsDocumentType(strand.documentType)) {
      return `No generator for document type ${strand.documentType}`;
    }
    return undefined;
  }

  shouldProcess(strand: CodegenInput): boolean {
    return this.skipReason(strand) === undefined;
  }
}
