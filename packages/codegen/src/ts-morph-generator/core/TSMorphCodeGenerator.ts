import { type DocumentModelState } from "document-model";
import fs from "fs/promises";
import { Project } from "ts-morph";
import { ReducerGenerator } from "../file-generators/ReducerGenerator.js";
import { DirectoryManager } from "../utilities/DirectoryManager.js";
import { ImportManager } from "../utilities/ImportManager.js";
import { type FileGenerator } from "./FileGenerator.js";
import {
  type Actions,
  type CodeGeneratorOptions,
  type GenerationContext,
  type ModuleSpec,
  type PHProjectDirectories,
} from "./GenerationContext.js";
export class TSMorphCodeGenerator {
  private project = new Project();
  private generators = new Map<string, FileGenerator>();
  private directories: PHProjectDirectories = {
    documentModelDir: "document-model",
    editorsDir: "editors",
    processorsDir: "processors",
    subgraphsDir: "subgraphs",
  };

  constructor(
    private rootDir: string,
    private docModels: DocumentModelState[],
    options: CodeGeneratorOptions = { directories: {} },
  ) {
    this.directories = {
      ...this.directories,
      ...options.directories,
    };

    this.setupGenerators();
  }

  private setupGenerators(): void {
    const importManager = new ImportManager();
    const directoryManager = new DirectoryManager(this.directories);

    // Register all generators
    this.generators.set(
      "reducers",
      new ReducerGenerator(importManager, directoryManager),
    );
  }

  // Generate specific file types
  async generateReducers(): Promise<void> {
    await this.generateFileType("reducers");
  }

  // Generate everything
  async generateAll(): Promise<void> {
    for (const [type] of this.generators) {
      await this.generateFileType(type);
    }
  }

  private async generateFileType(type: string): Promise<void> {
    const generator = this.generators.get(type);
    if (!generator) {
      throw new Error(`No generator registered for type: ${type}`);
    }

    await this.setupProject();

    for (const docModel of this.docModels) {
      const latestSpec =
        docModel.specifications[docModel.specifications.length - 1];

      for (const module of latestSpec.modules) {
        const context = this.createGenerationContext(docModel, module);

        await generator.generate(context);
      }
    }
  }

  private async setupProject(): Promise<void> {
    await this.ensureDirectoryExists(this.rootDir);
    const sourcePath = `${this.rootDir}/**/*.ts`;
    this.project.addSourceFilesAtPaths(sourcePath);
  }

  private createGenerationContext(
    docModel: DocumentModelState,
    module: ModuleSpec,
  ): GenerationContext {
    const actions: Actions[] = module.operations.map((op) => ({
      name: op.name,
      hasInput: op.schema !== null,
      hasAttachment: op.schema?.includes(": Attachment"),
      scope: op.scope || "global",
      state: op.scope === "global" ? "" : op.scope,
      errors: op.errors,
    }));

    return {
      rootDir: this.rootDir,
      docModel,
      module,
      project: this.project,
      actions,
    };
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (err) {
      console.error(`Failed to create directory: ${dirPath}`, err);
      throw err;
    }
  }
}
