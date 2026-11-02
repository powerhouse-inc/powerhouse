import type { Sha256Digest } from "@powerhousedao/shared/document-model";
import type { TypeScriptSourceImportInterface } from "document-model/tooling";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function uncachedDefinitionSourceRevision(): Sha256Digest {
  return `sha256:${createHash("sha256").update(randomUUID()).digest("hex")}`;
}

type ViteModule = {
  readonly file: string | null;
  readonly importedModules: ReadonlySet<ViteModule>;
};

type ViteServer = {
  readonly environments: {
    readonly ssr: {
      readonly moduleGraph: {
        ensureEntryFromUrl(url: string): Promise<ViteModule>;
      };
    };
  };
  ssrLoadModule(url: string): Promise<Record<string, unknown>>;
  close(): Promise<void>;
};

type Environment = {
  readonly server: Promise<ViteServer> | undefined;
  readonly cacheDir: string | undefined;
  readonly sourceFiles: Map<string, readonly string[]>;
};

export class ViteTypeScriptSourceImportAdapter implements TypeScriptSourceImportInterface {
  #revision: Sha256Digest | undefined;
  #environment: Environment = {
    server: undefined,
    cacheDir: undefined,
    sourceFiles: new Map(),
  };

  async importModule(request: {
    readonly packageRoot: string;
    readonly specifier: `./${string}`;
    readonly packageRevision: Sha256Digest;
  }): Promise<Readonly<Record<string, unknown>>> {
    if (this.#revision !== request.packageRevision) {
      const superseded = this.#environment;
      const cacheDir = mkdtempSync(join(tmpdir(), "ph-definition-vite-"));
      this.#revision = request.packageRevision;
      this.#environment = {
        server: createViteServer(request.packageRoot, cacheDir),
        cacheDir,
        sourceFiles: new Map(),
      };
      await closeEnvironment(superseded);
    }
    const environment = this.#environment;
    const server = await environment.server;
    if (server === undefined) throw new Error("The Vite server was closed.");
    const { namespace, files } = await importPhysicalModule(
      server,
      request.packageRoot,
      request.specifier,
    );
    environment.sourceFiles.set(request.specifier, files);
    return namespace;
  }

  filesImportedBy(specifier: string): readonly string[] {
    return this.#environment.sourceFiles.get(specifier) ?? [];
  }

  async disposeRevision(revision?: Sha256Digest): Promise<void> {
    if (revision !== undefined && revision !== this.#revision) return;
    const superseded = this.#environment;
    this.#revision = undefined;
    this.#environment = {
      server: undefined,
      cacheDir: undefined,
      sourceFiles: new Map(),
    };
    await closeEnvironment(superseded);
  }
}

/**
 * Imports the file the definition-source resolver checked. A root-relative
 * URL is Vite route syntax, so `./@fs/...` would name another file. A file
 * URL of the real path names this one, and the check refuses any path Vite
 * still resolves to a different file.
 */
async function importPhysicalModule(
  server: ViteServer,
  packageRoot: string,
  specifier: `./${string}`,
) {
  const file = realpathSync.native(
    resolve(packageRoot, ...specifier.slice(2).split("/")),
  );
  const url = pathToFileURL(file).href;
  // Resolves without evaluating: the module graph entry ssrLoadModule reuses.
  const entry =
    await server.environments.ssr.moduleGraph.ensureEntryFromUrl(url);
  if (entry.file === null || pathToFileURL(entry.file).href !== url) {
    throw new Error(
      `Vite would evaluate ${entry.file ?? url} instead of ${file}, so the module was not imported. Vite reads "?" and "#" in a module path as a query or hash; move the package to a path without them.`,
    );
  }
  const namespace = await server.ssrLoadModule(url);
  const seen = new Set<ViteModule>();
  const pending = [entry];
  const files: string[] = [];
  for (const current of pending) {
    if (seen.has(current)) continue;
    seen.add(current);
    if (current.file !== null) files.push(current.file);
    pending.push(...current.importedModules);
  }
  return { namespace, files };
}

async function closeEnvironment({ server, cacheDir }: Environment) {
  if (server !== undefined) {
    await server.then(
      (instance) => instance.close(),
      () => undefined,
    );
  }
  if (cacheDir !== undefined) {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

const PACKAGES_SHARING_MODULE_STATE = [
  "document-model",
  "@powerhousedao/shared",
];

async function createViteServer(
  packageRoot: string,
  cacheDir: string,
): Promise<ViteServer> {
  const { createServer } = await import("vite");
  return await createServer({
    root: packageRoot,
    configFile: false,
    cacheDir,
    logLevel: "silent",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
    ssr: { external: PACKAGES_SHARING_MODULE_STATE },
    // Project aliases resolve as they do in Connect, which sets the same flag.
    resolve: { dedupe: PACKAGES_SHARING_MODULE_STATE, tsconfigPaths: true },
  });
}
