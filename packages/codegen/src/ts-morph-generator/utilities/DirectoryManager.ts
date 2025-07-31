import { paramCase, pascalCase } from "change-case";
import fs from "fs/promises";
import path from "path";
import { type Project, type SourceFile } from "ts-morph";
import { type PHProjectDirectories } from "../core/GenerationContext.js";

export class DirectoryManager {
  private directories: Required<PHProjectDirectories> = {
    documentModelDir: "document-model",
    editorsDir: "editors",
    processorsDir: "processors",
    subgraphsDir: "subgraphs",
  };

  constructor(directories: PHProjectDirectories = {}) {
    this.directories = {
      ...this.directories,
      ...directories,
    };
  }
  async ensureExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (err) {
      console.error(`Failed to create directory: ${dirPath}`, err);
      throw err;
    }
  }

  // Path builders for different file types
  getReducerPath(
    rootDir: string,
    docModelName: string,
    moduleName: string,
  ): string {
    return path.join(
      rootDir,
      this.directories.documentModelDir,
      paramCase(docModelName),
      "src",
      "reducers",
      `${paramCase(moduleName)}.ts`,
    );
  }

  getActionsPath(
    rootDir: string,
    docModelName: string,
    moduleName: string,
  ): string {
    return path.join(
      rootDir,
      this.directories.documentModelDir,
      paramCase(docModelName),
      "src",
      "actions",
      `${paramCase(moduleName)}.ts`,
    );
  }

  getComponentPath(
    rootDir: string,
    docModelName: string,
    componentName: string,
  ): string {
    return path.join(
      rootDir,
      this.directories.documentModelDir,
      paramCase(docModelName),
      "src",
      "components",
      `${pascalCase(componentName)}.tsx`,
    );
  }

  getTypesPath(rootDir: string, docModelName: string): string {
    return path.join(
      rootDir,
      this.directories.documentModelDir,
      paramCase(docModelName),
      "src",
      "types.ts",
    );
  }

  async createSourceFile(
    project: Project,
    filePath: string,
  ): Promise<SourceFile> {
    await this.ensureExists(path.dirname(filePath));
    return (
      project.addSourceFileAtPathIfExists(filePath) ??
      project.createSourceFile(filePath, "", { overwrite: false })
    );
  }
}
