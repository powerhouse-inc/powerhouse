import type { TypeScriptSourceImportInterface } from "document-model/tooling";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
export { ViteTypeScriptSourceImportAdapter } from "@powerhousedao/codegen/utils";

export class BuildGraphTypeScriptSourceImportAdapter implements TypeScriptSourceImportInterface {
  readonly #packageRoot: string;
  readonly #emittedModules: ReadonlyMap<string, string>;

  constructor(options: {
    readonly packageRoot: string;
    readonly emittedModules: ReadonlyMap<string, string>;
  }) {
    this.#packageRoot = options.packageRoot;
    this.#emittedModules = options.emittedModules;
  }

  async importModule(request: {
    readonly specifier: `./${string}`;
  }): Promise<Readonly<Record<string, unknown>>> {
    const emitted = this.#emittedModules.get(
      resolve(this.#packageRoot, request.specifier),
    );
    if (emitted === undefined) {
      throw new Error(`TypeScript emitted no module for ${request.specifier}.`);
    }
    const url = pathToFileURL(emitted);
    return (await import(url.href)) as Readonly<Record<string, unknown>>;
  }
}
