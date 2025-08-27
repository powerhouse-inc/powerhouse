import { viteCommonjs } from "@originjs/vite-plugin-commonjs";
import {
  isSubgraphClass,
  type SubgraphClass,
} from "@powerhousedao/reactor-api";
import {
  childLogger,
  type IProcessorHostModule,
  type ProcessorFactory,
} from "document-drive";
import { type DocumentModelModule } from "document-model";
import { access } from "node:fs/promises";
import path from "node:path";
import { createServer, type ViteDevServer } from "vite";
import {
  type ISubscribablePackageLoader,
  type ISubscriptionOptions,
} from "./types.js";
import { debounce } from "./util.js";

export class VitePackageLoader implements ISubscribablePackageLoader {
  private readonly logger = childLogger(["reactor-api", "vite-loader"]);

  private readonly vite: ViteDevServer;

  static async build(vite?: ViteDevServer) {
    const server = vite ?? (await startViteServer());
    return new VitePackageLoader(server);
  }

  constructor(vite: ViteDevServer) {
    this.vite = vite;
  }

  private getDocumentModelsPath(identifier: string): string {
    return path.join(identifier, "./document-models");
  }

  private getSubgraphsPath(identifier: string): string {
    return path.join(identifier, "./subgraphs");
  }

  private getProcessorsPath(identifier: string): string {
    return path.join(identifier, "./processors");
  }

  async loadDocumentModels(identifier: string): Promise<DocumentModelModule[]> {
    const fullPath = this.getDocumentModelsPath(identifier);
    this.logger.verbose("Loading document models from", fullPath);

    try {
      await access(fullPath);

      const localDMs = (await this.vite.ssrLoadModule(fullPath)) as Record<
        string,
        DocumentModelModule
      >;

      const exports = Object.values(localDMs);

      // duck type
      const documentModels: DocumentModelModule[] = [];
      for (const dm of exports) {
        if (dm.documentModel) {
          documentModels.push(dm);
        }
      }

      this.logger.verbose(
        `  ➜  Loaded ${documentModels.length} Document Models from: ${identifier}`,
      );

      return documentModels;
    } catch (e) {
      this.logger.verbose(`  ➜  No Document Models found for: ${identifier}`);
    }

    return [];
  }

  async loadSubgraphs(identifier: string): Promise<SubgraphClass[]> {
    const fullPath = this.getSubgraphsPath(identifier);

    this.logger.verbose("Loading subgraphs from", fullPath);

    let localSubgraphs: Record<string, Record<string, SubgraphClass>> = {};
    try {
      await access(fullPath);

      localSubgraphs = await this.vite.ssrLoadModule(fullPath);
    } catch (e) {
      this.logger.verbose(`  ➜  No Subgraphs found for: ${identifier}`);

      return [];
    }

    const subgraphs: SubgraphClass[] = [];
    for (const [name, subgraph] of Object.entries(localSubgraphs)) {
      const SubgraphClass = subgraph[name];
      if (isSubgraphClass(SubgraphClass)) {
        subgraphs.push(SubgraphClass);
      }
    }

    this.logger.verbose(
      `  ➜  Loaded ${subgraphs.length} Subgraphs from: ${identifier}`,
    );

    return subgraphs;
  }

  async loadProcessors(
    identifier: string,
  ): Promise<((module: IProcessorHostModule) => ProcessorFactory) | null> {
    const fullPath = this.getProcessorsPath(identifier);

    this.logger.verbose("Loading processors from", fullPath);

    try {
      await access(fullPath);

      const module = await this.vite.ssrLoadModule(fullPath);

      if (
        module.processorFactory &&
        typeof module.processorFactory === "function"
      ) {
        this.logger.verbose(
          `  ➜  Loaded Processor factory from: ${identifier}`,
        );

        return module.processorFactory as (
          module: IProcessorHostModule,
        ) => ProcessorFactory;
      }
    } catch (e) {
      //
    }

    this.logger.verbose(`  ➜  No Processor Factory found for: ${identifier}`);

    // return empty processor factory
    return null;
  }

  onDocumentModelsChange(
    identifier: string,
    handler: (documentModels: DocumentModelModule[]) => void,
    options?: ISubscriptionOptions,
  ): () => void {
    const documentModelsPath = this.getDocumentModelsPath(identifier);

    const listener = debounce(async (changedPath: string) => {
      if (path.matchesGlob(changedPath, path.join(documentModelsPath, "**"))) {
        const documentModels = await this.loadDocumentModels(identifier);
        handler(documentModels);
      }
    }, options?.debounce ?? 100);

    this.vite.watcher.on("change", listener);

    return () => {
      this.vite.watcher.off("change", listener);
    };
  }

  onSubgraphsChange(
    identifier: string,
    handler: (subgraphs: SubgraphClass[]) => void,
    options?: ISubscriptionOptions,
  ): () => void {
    const subgraphsPath = this.getSubgraphsPath(identifier);
    const listener = debounce(async (changedPath: string) => {
      if (path.matchesGlob(changedPath, path.join(subgraphsPath, "**"))) {
        const subgraphs = await this.loadSubgraphs(identifier);
        handler(subgraphs);
      }
    }, options?.debounce ?? 100);
    this.vite.watcher.on("change", listener);

    return () => {
      this.vite.watcher.off("change", listener);
    };
  }

  onProcessorsChange(
    identifier: string,
    handler: (
      processors: ((module: IProcessorHostModule) => ProcessorFactory) | null,
    ) => void,
    options?: ISubscriptionOptions,
  ): () => void {
    const processorsPath = this.getProcessorsPath(identifier);
    const listener = debounce(async (changedPath: string) => {
      if (path.matchesGlob(changedPath, path.join(processorsPath, "**"))) {
        const processors = await this.loadProcessors(identifier);
        handler(processors);
      }
    }, options?.debounce ?? 100);
    this.vite.watcher.on("change", listener);

    return () => {
      this.vite.watcher.off("change", listener);
    };
  }
}

export async function startViteServer() {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
    build: {
      rollupOptions: {
        input: [],
      },
    },
    plugins: [
      viteCommonjs(),
      {
        name: "suppress-hmr",
        handleHotUpdate() {
          return []; // return empty array to suppress server refresh
        },
      },
    ],
  });

  return vite;
}
