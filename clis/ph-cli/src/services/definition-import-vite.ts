import type { TypeScriptSourceImportInterface } from "document-model/tooling";
import { createServer, type InlineConfig, type ViteDevServer } from "vite";

type DefinitionViteServer = Pick<ViteDevServer, "close" | "ssrLoadModule">;
type DefinitionViteServerFactory = (
  config: InlineConfig,
) => Promise<DefinitionViteServer>;

/**
 * Imports author TypeScript without writing generated JavaScript. A server is
 * shared by all roots in one immutable package revision and closed explicitly
 * by the command session.
 */
export class ViteTypeScriptSourceImportAdapter implements TypeScriptSourceImportInterface {
  readonly #createServer: DefinitionViteServerFactory;
  readonly #servers = new Map<string, Promise<DefinitionViteServer>>();

  constructor(factory: DefinitionViteServerFactory = createServer) {
    this.#createServer = factory;
  }

  async importModule(
    request: Parameters<TypeScriptSourceImportInterface["importModule"]>[0],
  ): Promise<Readonly<Record<string, unknown>>> {
    request.signal?.throwIfAborted();
    const key = `${request.packageRoot}\u0000${request.packageRevision}`;
    let serverPromise = this.#servers.get(key);
    if (!serverPromise) {
      serverPromise = this.#createServer({
        root: request.packageRoot,
        configFile: false,
        appType: "custom",
        logLevel: "silent",
        server: {
          middlewareMode: true,
          hmr: false,
          watch: null,
        },
      });
      this.#servers.set(key, serverPromise);
      void serverPromise.catch(() => this.#servers.delete(key));
    }

    const server = await serverPromise;
    request.signal?.throwIfAborted();
    const namespace = (await server.ssrLoadModule(
      request.specifier,
    )) as unknown;
    request.signal?.throwIfAborted();
    if (
      namespace === null ||
      typeof namespace !== "object" ||
      Array.isArray(namespace)
    ) {
      throw new TypeError("Vite returned a non-object module namespace.");
    }
    return namespace as Readonly<Record<string, unknown>>;
  }

  async close(): Promise<void> {
    const servers = [...this.#servers.values()];
    this.#servers.clear();
    const settled = await Promise.allSettled(servers);
    await Promise.all(
      settled.flatMap((result) =>
        result.status === "fulfilled" ? [result.value.close()] : [],
      ),
    );
  }
}
