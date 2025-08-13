import { childLogger } from "document-drive";
import { type DocumentModelModule } from "document-model";
import { access } from "node:fs/promises";
import path from "node:path";
import { createServer, type ViteDevServer } from "vite";

interface IPackageLoader {
  load(): Promise<DocumentModelModule[]>;
  onDocumentModelsChange(
    callback: (models: DocumentModelModule[]) => void,
  ): Promise<() => void>;
}

function debounce<T extends (...args: any[]) => void>(
  func: T,
  delay = 100,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>): void => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

export class VitePackageLoader implements IPackageLoader {
  private readonly logger = childLogger(["reactor-local", "vite-loader"]);

  private readonly root: string;
  private readonly documentModelsDir: string;

  private vite: ViteDevServer | undefined;

  constructor(root: string, documentModelsDir: string) {
    this.root = root;
    this.documentModelsDir = documentModelsDir;
  }

  private get fullPath(): string {
    return path.join(this.root, this.documentModelsDir);
  }

  private async initVite() {
    if (this.vite) {
      return this.vite;
    }

    this.vite = await createServer({
      root: this.root,
      logLevel: "info",
      server: {
        hmr: false,
        middlewareMode: true,
        warmup: {
          ssrFiles: [this.fullPath],
        },
        fs: {
          allow: [this.fullPath],
        },
      },
      optimizeDeps: {
        // It's recommended to disable deps optimization
        noDiscovery: true,
        include: [],
      },
    });

    return this.vite;
  }

  async load(): Promise<DocumentModelModule[]> {
    const vite = await this.initVite();

    await access(this.fullPath);
    this.logger.verbose("Loading document models from", this.fullPath);

    try {
      const localDMs = (await vite.ssrLoadModule(this.fullPath)) as Record<
        string,
        DocumentModelModule
      >;

      const exports = Object.values(localDMs);

      // duck type
      const documentModels: DocumentModelModule[] = [];
      for (const dm of exports) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (dm.documentModel) {
          documentModels.push(dm);
        }
      }

      this.logger.verbose(
        `  ➜  Loaded ${documentModels.length} Document Models from: ${this.fullPath}`,
      );

      return documentModels;
    } catch (e) {
      this.logger.verbose(
        `  ➜  No Document Models found for: ${this.fullPath}${e ? `\n${JSON.stringify(e)}` : ""}`,
      );
    }

    return [];
  }

  async onDocumentModelsChange(
    callback: (models: DocumentModelModule[]) => void,
  ) {
    const vite = await this.initVite();
    const listener = debounce(async (changedPath: string) => {
      if (path.matchesGlob(changedPath, path.join(this.fullPath, "**"))) {
        const documentModels = await this.load();
        callback(documentModels);
      }
    }, 100);
    vite.watcher.on("change", listener);

    return () => {
      vite.watcher.off("change", listener);
    };
  }
}
