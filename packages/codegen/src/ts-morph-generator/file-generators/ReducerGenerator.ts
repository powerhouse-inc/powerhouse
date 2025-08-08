import { camelCase, paramCase, pascalCase } from "change-case";
import {
  SyntaxKind,
  VariableDeclarationKind,
  type MethodDeclaration,
  type ObjectLiteralExpression,
  type SourceFile,
} from "ts-morph";
import { FileGenerator } from "../core/FileGenerator.js";
import {
  type GenerationContext,
  type Operation,
} from "../core/GenerationContext.js";

export class ReducerGenerator extends FileGenerator {
  async generate(context: GenerationContext): Promise<void> {
    // Skip if no actions to generate
    if (context.operations.length === 0) return;

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
    this.createReducerObject(
      sourceFile,
      typeImportName,
      context.operations,
      context.forceUpdate,
    );

    await sourceFile.save();
  }

  private static getDefaultReducerCode(methodName: string): string[] {
    return [
      `// TODO: Implement "${methodName}" reducer`,
      `throw new Error('Reducer "${methodName}" not yet implemented');`,
    ];
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
    operations: Operation[],
    forceUpdate = false,
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

    for (const operation of operations) {
      this.addReducerMethod(initializer, operation, forceUpdate);
    }
  }

  private addReducerMethod(
    objectLiteral: ObjectLiteralExpression,
    operation: Operation,
    forceUpdate = false,
  ): void {
    const actionName = camelCase(operation.name ?? "");
    if (!actionName) return;

    const methodName = `${actionName}Operation`;

    const reducerCode = operation.reducer?.trim();

    const existingReducer = objectLiteral
      .getProperty(methodName)
      ?.asKind(SyntaxKind.MethodDeclaration);

    // if reducer already exists but forceUpdate is true, update it
    if (existingReducer) {
      if (forceUpdate && reducerCode) {
        existingReducer.setBodyText("");
        this.setReducerMethodCode(existingReducer, reducerCode);
      }
      return;
    }

    // if reducer doesn't exist, create it and set the code with the default code if no code is provided
    const method = objectLiteral.addMethod({
      name: methodName,
      parameters: [{ name: "state" }, { name: "action" }, { name: "dispatch" }],
    });
    this.setReducerMethodCode(method, reducerCode);
  }

  private setReducerMethodCode(reducer: MethodDeclaration, code?: string) {
    reducer.addStatements(
      code ? [code] : ReducerGenerator.getDefaultReducerCode(reducer.getName()),
    );
  }
}
