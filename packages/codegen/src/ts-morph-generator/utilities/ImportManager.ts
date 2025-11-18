import type { ImportDeclaration, SourceFile } from "ts-morph";

export interface ImportSpec {
  moduleSpecifier: string;
  namedImports?: string[];
  defaultImport?: string;
  isTypeOnly?: boolean;
}

export class ImportManager {
  addImport(sourceFile: SourceFile, spec: ImportSpec): void {
    // Check if import already exists
    const existing = sourceFile.getImportDeclaration(
      (imp) => imp.getFullText() === spec.moduleSpecifier,
    );
    if (existing) {
      this.mergeImports(existing, spec);
    } else {
      sourceFile.addImportDeclaration(spec);
    }
  }

  addTypeImport(sourceFile: SourceFile, typeName: string, path: string): void {
    this.addImport(sourceFile, {
      moduleSpecifier: path,
      namedImports: [typeName],
      isTypeOnly: true,
    });
  }

  addNamedImports(
    sourceFile: SourceFile,
    imports: string[],
    path: string,
  ): void {
    this.addImport(sourceFile, {
      moduleSpecifier: path,
      namedImports: imports,
    });
  }

  private mergeImports(
    existingImport: ImportDeclaration,
    newSpec: ImportSpec,
  ): void {
    // Logic to merge named imports if they don't already exist
    if (newSpec.namedImports) {
      const existingNames = existingImport
        .getNamedImports()
        .map((ni) => ni.getName());
      const newNames = newSpec.namedImports.filter(
        (name) => !existingNames.includes(name),
      );

      if (newNames.length > 0) {
        existingImport.addNamedImports(newNames);
      }
    }
  }

  replaceImportByName(
    sourceFile: SourceFile,
    name: string,
    path: string,
    isTypeOnly = false,
  ): void {
    const existing = sourceFile
      .getImportDeclarations()
      .filter((imp) =>
        imp.getNamedImports().find((ni) => ni.getName() === name),
      );
    existing.forEach((imp) => imp.remove());
    sourceFile.addImportDeclaration({
      moduleSpecifier: path,
      namedImports: [name],
      isTypeOnly,
    });
    sourceFile.saveSync();
  }
}
