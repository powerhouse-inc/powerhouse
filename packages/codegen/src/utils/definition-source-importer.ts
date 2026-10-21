import type { Sha256Digest } from "@powerhousedao/shared/document-model";
import { createHash, randomUUID } from "node:crypto";
import type { TypeScriptSourceImportInterface } from "document-model/tooling";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function uncachedDefinitionSourceRevision(): Sha256Digest {
  return `sha256:${createHash("sha256").update(randomUUID()).digest("hex")}`;
}

type ViteServer = {
  ssrLoadModule(url: string): Promise<Record<string, unknown>>;
  close(): Promise<void>;
};

export class ViteTypeScriptSourceImportAdapter implements TypeScriptSourceImportInterface {
  #revision: string | undefined;
  #server: Promise<ViteServer> | undefined;
  #cacheDir: string | undefined;

  async importModule(request: {
    readonly packageRoot: string;
    readonly specifier: `./${string}`;
    readonly packageRevision: `sha256:${string}`;
    readonly signal?: AbortSignal;
  }): Promise<Readonly<Record<string, unknown>>> {
    if (this.#revision !== request.packageRevision) {
      const superseded = { server: this.#server, cacheDir: this.#cacheDir };
      this.#cacheDir = mkdtempSync(join(tmpdir(), "ph-definition-vite-"));
      this.#revision = request.packageRevision;
      this.#server = createViteServer(request.packageRoot, this.#cacheDir);
      await closeEnvironment(superseded);
    }
    const server = await (this.#server as Promise<ViteServer>);
    return await server.ssrLoadModule(`/${request.specifier.slice(2)}`);
  }

  async disposeRevision(revision?: `sha256:${string}`): Promise<void> {
    if (revision !== undefined && revision !== this.#revision) return;
    const superseded = { server: this.#server, cacheDir: this.#cacheDir };
    this.#server = undefined;
    this.#revision = undefined;
    this.#cacheDir = undefined;
    await closeEnvironment(superseded);
  }
}

async function closeEnvironment(environment: {
  readonly server: Promise<ViteServer> | undefined;
  readonly cacheDir: string | undefined;
}): Promise<void> {
  if (environment.server !== undefined) {
    await environment.server.then(
      (instance) => instance.close(),
      () => undefined,
    );
  }
  if (environment.cacheDir !== undefined) {
    rmSync(environment.cacheDir, { recursive: true, force: true });
  }
}

const PACKAGES_SHARING_MODULE_REGISTRY = [
  "document-model",
  "@powerhousedao/shared",
  "@powerhousedao/reactor-api",
];

async function createViteServer(
  packageRoot: string,
  cacheDir: string,
): Promise<ViteServer> {
  const { createServer } = await import("vite");
  const server = await createServer({
    root: packageRoot,
    configFile: false,
    cacheDir,
    logLevel: "silent",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
    // Sources compile against the installed compiler instead of a copy Vite
    // transformed. A second copy has its own module registry, so the check
    // would not see the report a declaration raised while compiling.
    ssr: { external: PACKAGES_SHARING_MODULE_REGISTRY },
    resolve: { dedupe: PACKAGES_SHARING_MODULE_REGISTRY },
  });
  return server as unknown as ViteServer;
}
