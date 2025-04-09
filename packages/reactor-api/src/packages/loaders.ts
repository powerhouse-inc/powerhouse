import { SubgraphClass } from "#graphql/index.js";
import { ProcessorFactory } from "document-drive/processors/types";
import { DocumentModelModule } from "document-model";
import {
  IDocumentModelLoader,
  IProcessorLoader,
  ISubgraphLoader,
} from "./types.js";
import { loadDependency } from "./util.js";

export class DocumentModelLoader implements IDocumentModelLoader {
  async load(identifier: string): Promise<DocumentModelModule[]> {
    try {
      console.log("> Loading package:", identifier);

      const pkgModule = (await loadDependency(
        identifier,
        "document-models",
      )) as {
        [key: string]: DocumentModelModule;
      };

      if (pkgModule) {
        console.log(`  ➜  Loaded Document Models from: ${identifier}`);
        return Object.values(pkgModule);
      } else {
        console.warn(`  ➜  No Document Models found: ${identifier}`);
      }
    } catch (e) {
      console.error("Error loading Document Models from", identifier, e);
    }

    return [];
  }
}

export class SubgraphLoader implements ISubgraphLoader {
  async load(identifier: string): Promise<SubgraphClass[]> {
    const pkgModule = (await loadDependency(identifier, "subgraphs")) as
      | undefined
      | Record<string, Record<string, SubgraphClass>>;

    if (!pkgModule) {
      console.warn(`  ➜  No Subgraphs found: ${identifier}`);
      return [];
    }

    const subgraphs = Object.values(pkgModule).map((subgraph) => {
      return Object.values(subgraph);
    });

    console.log(`  ➜  Loaded Subgraphs from: ${identifier}`);

    return subgraphs.flat();
  }
}

export class ProcessorLoader implements IProcessorLoader {
  async load(identifier: string): Promise<(module: any) => ProcessorFactory> {
    console.log("> Loading processors from package:", identifier);
    const pkgModule = (await loadDependency(identifier, "processors")) as (
      module: any,
    ) => ProcessorFactory;
    if (pkgModule) {
      console.log(`  ➜  Loaded Processor Factory from: ${identifier}`);
      return pkgModule;
    } else {
      console.warn(`  ➜  No Processor Factory found: ${identifier}`);
    }

    // empty processor factory
    return () => () => [];
  }
}
