import type { TypeScriptSourceImportInterface } from "document-model/tooling";
import { mkdir, mkdtemp, realpath } from "node:fs/promises";
import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build as tsdownBuild, type InlineConfig } from "tsdown";
import { assertNoSymlinks, relativePathWithin } from "./file-tree.js";

type TsdownBuild = typeof tsdownBuild;

/** Imports definitions from a temporary node bundle made by the build toolchain. */
export class NodeBuildTypeScriptSourceImportAdapter implements TypeScriptSourceImportInterface {
  readonly #build: TsdownBuild;
  readonly #imports = new Map<
    string,
    Promise<Readonly<Record<string, unknown>>>
  >();
  readonly #temporaryDirectories = new Set<string>();

  constructor(build: TsdownBuild = tsdownBuild) {
    this.#build = build;
  }

  importModule(
    request: Parameters<TypeScriptSourceImportInterface["importModule"]>[0],
  ): Promise<Readonly<Record<string, unknown>>> {
    request.signal?.throwIfAborted();
    if (request.signal) return this.#compileAndImport(request);
    const key = `${request.packageRoot}\u0000${request.packageRevision}\u0000${request.specifier}`;
    let imported = this.#imports.get(key);
    if (!imported) {
      imported = this.#compileAndImport(request);
      this.#imports.set(key, imported);
      void imported.catch(() => this.#imports.delete(key));
    }
    return imported;
  }

  async #compileAndImport(
    request: Parameters<TypeScriptSourceImportInterface["importModule"]>[0],
  ): Promise<Readonly<Record<string, unknown>>> {
    // Keep the temporary bundle below the consumer package. The build leaves
    // dependencies external, so Node must be able to walk from the emitted
    // module to that package's node_modules directory during import.
    const temporaryRoot = join(request.packageRoot, ".ph");
    const temporarySymlinkError = (path: string) =>
      new Error(
        `The temporary definition build path contains a symbolic link: ${path}.`,
      );
    await assertNoSymlinks(
      request.packageRoot,
      temporaryRoot,
      temporarySymlinkError,
    );
    await mkdir(temporaryRoot, { recursive: true });
    await assertNoSymlinks(
      request.packageRoot,
      temporaryRoot,
      temporarySymlinkError,
    );
    const [packageIdentity, temporaryIdentity] = await Promise.all([
      realpath(request.packageRoot),
      realpath(temporaryRoot),
    ]);
    if (
      relativePathWithin(packageIdentity, temporaryIdentity) === null ||
      temporaryIdentity !== join(packageIdentity, ".ph")
    ) {
      throw temporarySymlinkError(temporaryRoot);
    }
    const outDir = await mkdtemp(join(temporaryIdentity, "definition-build-"));
    this.#temporaryDirectories.add(outDir);
    const config: InlineConfig = {
      cwd: request.packageRoot,
      config: false,
      entry: { definition: resolve(request.packageRoot, request.specifier) },
      outDir,
      platform: "node",
      format: "esm",
      fixedExtension: true,
      hash: false,
      clean: true,
      dts: false,
      sourcemap: false,
      logLevel: "silent",
      // Author-owned relative modules belong in the temporary bundle. Bare
      // package imports must retain host identity and resolve from the
      // consumer package (not be duplicated into the definition bundle).
      deps: { neverBundle: [/^[^./]/] },
      outputOptions: { codeSplitting: false },
    };
    const bundles = await this.#build(config);
    request.signal?.throwIfAborted();
    const entry = bundles
      .flatMap((bundle) => bundle.chunks)
      .find((chunk) => chunk.type === "chunk" && chunk.isEntry);
    if (!entry) {
      throw new TypeError("The build toolchain emitted no definition entry.");
    }
    const namespace = (await import(
      pathToFileURL(join(entry.outDir, entry.fileName)).href
    )) as unknown;
    request.signal?.throwIfAborted();
    if (
      namespace === null ||
      typeof namespace !== "object" ||
      Array.isArray(namespace)
    ) {
      throw new TypeError(
        "The build toolchain returned a non-object namespace.",
      );
    }
    return namespace as Readonly<Record<string, unknown>>;
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.#imports.values());
    for (const directory of this.#temporaryDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    this.#temporaryDirectories.clear();
    this.#imports.clear();
  }
}
