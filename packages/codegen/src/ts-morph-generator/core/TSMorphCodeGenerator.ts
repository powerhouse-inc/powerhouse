import { type DocumentModelState, type Module } from "document-model";
import fs from "fs/promises";
import { Project } from "ts-morph";
import { ReducerGenerator } from "../file-generators/ReducerGenerator.js";
import { DirectoryManager } from "../utilities/DirectoryManager.js";
import { ImportManager } from "../utilities/ImportManager.js";
import { type FileGenerator } from "./FileGenerator.js";
import {
  type CodeGeneratorOptions,
  type CodegenOperation,
  type GenerationContext,
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
  private forceUpdate = false;

  constructor(
    private rootDir: string,
    private docModels: DocumentModelState[],
    options: CodeGeneratorOptions = { directories: {}, forceUpdate: false },
  ) {
    this.directories = {
      ...this.directories,
      ...options.directories,
    };

    this.forceUpdate = options.forceUpdate ?? false;

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
        const context = this.createGenerationContext(
          docModel,
          module,
          this.forceUpdate,
        );

        await generator.generate(context);
      }
    }
  }

  private async setupProject(): Promise<void> {
    // Only load files from configured directories
    const sourcePaths: string[] = [];

    if (this.directories.documentModelDir) {
      const dirPath = `${this.rootDir}/${this.directories.documentModelDir}`;
      await this.ensureDirectoryExists(dirPath);
      sourcePaths.push(`${dirPath}/**/*.ts`);
    }
    if (this.directories.editorsDir) {
      const dirPath = `${this.rootDir}/${this.directories.editorsDir}`;
      await this.ensureDirectoryExists(dirPath);
      sourcePaths.push(`${dirPath}/**/*.ts`);
    }
    if (this.directories.processorsDir) {
      const dirPath = `${this.rootDir}/${this.directories.processorsDir}`;
      await this.ensureDirectoryExists(dirPath);
      sourcePaths.push(`${dirPath}/**/*.ts`);
    }
    if (this.directories.subgraphsDir) {
      const dirPath = `${this.rootDir}/${this.directories.subgraphsDir}`;
      await this.ensureDirectoryExists(dirPath);
      sourcePaths.push(`${dirPath}/**/*.ts`);
    }

    // Exclude node_modules from all paths
    sourcePaths.push(`!${this.rootDir}/**/node_modules/**`);

    if (sourcePaths.length > 0) {
      this.project.addSourceFilesAtPaths(sourcePaths);
    }
  }

  private createGenerationContext(
    docModel: DocumentModelState,
    module: Module,
    forceUpdate = false,
  ): GenerationContext {
    const operations: CodegenOperation[] = module.operations.map((op) => ({
      ...op,
      hasInput: op.schema !== null,
      hasAttachment: op.schema?.includes(": Attachment"),
      scope: op.scope || "global",
      state: op.scope === "global" ? "" : op.scope,
    }));

    return {
      rootDir: this.rootDir,
      docModel,
      module,
      project: this.project,
      operations,
      forceUpdate,
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
