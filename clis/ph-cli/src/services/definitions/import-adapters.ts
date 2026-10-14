import type { TypeScriptSourceImportInterface } from "document-model/tooling";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalPath } from "./paths.js";
import { importInNode } from "./node-import.mjs";
export { ViteTypeScriptSourceImportAdapter } from "@powerhousedao/codegen/utils";

export class BuildGraphTypeScriptSourceImportAdapter implements TypeScriptSourceImportInterface {
  readonly #packageRoot: string;
  readonly #emittedModules: ReadonlyMap<string, string>;
  readonly #loaderDiagnostics: string;

  constructor(options: {
    readonly packageRoot: string;
    readonly emittedModules: ReadonlyMap<string, string>;
    readonly loaderDiagnostics?: string;
  }) {
    this.#packageRoot = options.packageRoot;
    this.#emittedModules = options.emittedModules;
    this.#loaderDiagnostics = options.loaderDiagnostics ?? "";
  }

  async importModule(request: {
    readonly specifier: `./${string}`;
  }): Promise<Readonly<Record<string, unknown>>> {
    const emitted = this.#emittedModules.get(
      canonicalPath(resolve(this.#packageRoot, request.specifier)),
    );
    if (emitted === undefined) {
      throw new Error(
        `TypeScript emitted no module for ${request.specifier}.${this.#loaderDiagnostics ? `\n${this.#loaderDiagnostics}` : ""}`,
      );
    }
    const url = emitted.startsWith("file:")
      ? new URL(emitted)
      : pathToFileURL(emitted);
    try {
      return await importInNode(url.href);
    } catch (error) {
      if (this.#loaderDiagnostics === "") throw error;
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n${this.#loaderDiagnostics}`,
        { cause: error },
      );
    }
  }
}
