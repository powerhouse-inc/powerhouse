import { type BaseDocumentGen } from "./base-document-gen.js";
import { DocumentCodegenManager } from "./document-codegen-manager.js";
import {
  AppGenerator,
  DocumentEditorGenerator,
  DocumentModelGenerator,
  PackageGenerator,
  ProcessorGenerator,
  SubgraphGenerator,
} from "./generators/index.js";
import { type Config } from "./types.js";

/**
 * Factory class for creating and configuring DocumentCodegenManager instances
 * with all the standard generators pre-registered
 */
export class DocumentCodegenFactory {
  /**
   * Create a DocumentCodegenManager with all standard generators registered
   */
  static createManager(
    config: Config,
    interactiveMode: boolean = false,
  ): DocumentCodegenManager {
    const manager = new DocumentCodegenManager(config, interactiveMode);

    // Register all the standard generators
    manager.registerGenerator(
      "powerhouse/document-model",
      DocumentModelGenerator,
    );
    manager.registerGenerator("powerhouse/package", PackageGenerator);
    manager.registerGenerator("powerhouse/app", AppGenerator);
    manager.registerGenerator(
      "powerhouse/document-editor",
      DocumentEditorGenerator,
    );
    manager.registerGenerator("powerhouse/subgraph", SubgraphGenerator);
    manager.registerGenerator("powerhouse/processor", ProcessorGenerator);

    return manager;
  }

  /**
   * Create a DocumentCodegenManager with only specific generators
   */
  static createManagerWithGenerators(
    config: Config,
    generators: Array<new (config: Config) => any>,
    interactiveMode: boolean = false,
  ): DocumentCodegenManager {
    const manager = new DocumentCodegenManager(config, interactiveMode);

    for (const generatorClass of generators) {
      const generator = new generatorClass(config) as BaseDocumentGen;
      const supportedTypes = generator.getSupportedDocumentTypes();

      for (const documentType of supportedTypes) {
        manager.registerGenerator(documentType, generatorClass);
      }
    }

    return manager;
  }

  /**
   * Get all available generator classes
   */
  static getAvailableGenerators() {
    return {
      DocumentModelGenerator,
      PackageGenerator,
      AppGenerator,
      DocumentEditorGenerator,
      SubgraphGenerator,
      ProcessorGenerator,
    };
  }
}
