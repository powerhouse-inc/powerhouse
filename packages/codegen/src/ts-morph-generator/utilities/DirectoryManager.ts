import { paramCase, pascalCase } from "change-case";
import fs from "fs/promises";
import path from "path";
import { type Project, type SourceFile } from "ts-morph";

export class DirectoryManager {
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
      "document-model",
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
      "document-model",
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
      "document-model",
      paramCase(docModelName),
      "src",
      "components",
      `${pascalCase(componentName)}.tsx`,
    );
  }

  getTypesPath(rootDir: string, docModelName: string): string {
    return path.join(
      rootDir,
      "document-model",
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
