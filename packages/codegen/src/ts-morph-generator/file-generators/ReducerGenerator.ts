import { camelCase, paramCase, pascalCase } from "change-case";
import {
  SyntaxKind,
  VariableDeclarationKind,
  type ObjectLiteralExpression,
  type SourceFile,
} from "ts-morph";
import { FileGenerator } from "../core/FileGenerator.js";
import {
  type Actions,
  type GenerationContext,
} from "../core/GenerationContext.js";

export class ReducerGenerator extends FileGenerator {
  async generate(context: GenerationContext): Promise<void> {
    // Skip if no actions to generate
    if (context.actions.length === 0) return;

    const filePath = this.getOutputPath(context);
    const sourceFile = await this.directoryManager.createSourceFile(
      context.project,
      filePath,
    );

    // Reducer-specific import logic
    const typeImportName = `${pascalCase(context.docModel.name)}${pascalCase(context.module.name)}Operations`;
    const typeImportPath = `../../gen/${paramCase(context.module.name)}/operations.js`;

    // Import management (shared utility)
    this.importManager.addTypeImport(
      sourceFile,
      typeImportName,
      typeImportPath,
    );

    // AST logic (specific to reducers)
    this.createReducerObject(sourceFile, typeImportName, context.actions);

    await sourceFile.save();
  }

  private getOutputPath(context: GenerationContext): string {
    return this.directoryManager.getReducerPath(
      context.rootDir,
      context.docModel.name,
      context.module.name,
    );
  }

  private createReducerObject(
    sourceFile: SourceFile,
    typeName: string,
    actions: Actions[],
  ): void {
    let reducerVar = sourceFile.getVariableDeclaration("reducer");

    if (!reducerVar) {
      sourceFile.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        isExported: true,
        declarations: [
          {
            name: "reducer",
            type: typeName,
            initializer: "{}",
          },
        ],
      });
      reducerVar = sourceFile.getVariableDeclarationOrThrow("reducer");
    } else {
      // Ensure correct type
      const typeNode = reducerVar.getTypeNode();
      if (!typeNode || typeNode.getText() !== typeName) {
        reducerVar.setType(typeName);
      }
    }

    const initializer = reducerVar.getInitializerIfKindOrThrow(
      SyntaxKind.ObjectLiteralExpression,
    );

    for (const action of actions) {
      this.addReducerMethod(initializer, action);
    }
  }

  private addReducerMethod(
    objectLiteral: ObjectLiteralExpression,
    action: Actions,
  ): void {
    const actionName = camelCase(action.name ?? "");
    if (!actionName) return;

    const methodName = `${actionName}Operation`;

    // Skip if method already exists
    if (objectLiteral.getProperty(methodName)) return;

    objectLiteral.addMethod({
      name: methodName,
      parameters: [{ name: "state" }, { name: "action" }, { name: "dispatch" }],
      statements: [
        `// TODO: Implement "${methodName}" reducer`,
        `throw new Error('Reducer "${methodName}" not yet implemented');`,
      ],
    });
  }
}
