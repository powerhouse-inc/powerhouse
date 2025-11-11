import type { SourceFile } from "ts-morph";

export class DeclarationManager {
  renameVariable(
    sourceFile: SourceFile,
    oldName: string,
    newName: string,
  ): void {
    const variable = sourceFile.getVariableDeclaration(oldName);

    if (variable) {
      variable.getNameNode().replaceWithText(newName);
      sourceFile.saveSync();
    }
  }
}
