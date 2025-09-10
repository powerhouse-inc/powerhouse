import { camelCase, paramCase, pascalCase } from "change-case";
import type {
  MethodDeclaration,
  ObjectLiteralExpression,
  SourceFile,
} from "ts-morph";
import { SyntaxKind, VariableDeclarationKind } from "ts-morph";
import { FileGenerator } from "../core/FileGenerator.js";
import type {
  GenerationContext,
  Operation,
  OperationError,
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

    // Detect and import error classes used in the actual reducer code (after generation)
    this.addErrorImports(sourceFile, context);

    await sourceFile.save();
  }

  private static getDefaultReducerCode(methodName: string): string[] {
    return [
      `// TODO: Implement "${methodName}" reducer`,
      `throw new Error('Reducer "${methodName}" not yet implemented');`,
    ];
  }

  private addErrorImports(
    sourceFile: SourceFile,
    context: GenerationContext,
  ): void {
    // Collect all errors from all operations
    const allErrors: OperationError[] = [];

    context.operations.forEach((operation) => {
      if (Array.isArray(operation.errors)) {
        operation.errors
          .filter((error) => error.name)
          .forEach((error) => {
            // Deduplicate errors by name
            if (!allErrors.find((e) => e.name === error.name)) {
              allErrors.push(error);
            }
          });
      }
    });

    if (allErrors.length === 0) return;

    // Analyze the actual source file content to find which errors are used
    const sourceFileContent = sourceFile.getFullText();
    const usedErrors = new Set<string>();

    allErrors.forEach((error) => {
      // Check if error class name is mentioned anywhere in the source file
      // Look for patterns like "new ErrorName" or "throw ErrorName" or "ErrorName("
      const errorPattern = new RegExp(`\\b${error.name}\\b`, "g");
      if (errorPattern.test(sourceFileContent)) {
        usedErrors.add(error.name!);
      }
    });

    // Add imports for used errors (only if they're not already imported)
    if (usedErrors.size > 0) {
      const errorImportPath = `../../gen/${paramCase(context.module.name)}/error.js`;
      const errorClassNames = Array.from(usedErrors);

      // Check if imports already exist to avoid duplicates
      const existingImports = sourceFile.getImportDeclarations();
      const existingErrorImport = existingImports.find(
        (importDecl) =>
          importDecl.getModuleSpecifierValue() === errorImportPath,
      );

      if (existingErrorImport) {
        // Get already imported error names
        const existingNamedImports = existingErrorImport
          .getNamedImports()
          .map((namedImport) => namedImport.getName());

        // Only import errors that aren't already imported
        const newErrorsToImport = errorClassNames.filter(
          (errorName) => !existingNamedImports.includes(errorName),
        );

        if (newErrorsToImport.length > 0) {
          // Add new named imports to existing import declaration
          existingErrorImport.addNamedImports(newErrorsToImport);
        }
      } else {
        // Create new import declaration
        this.importManager.addNamedImports(
          sourceFile,
          errorClassNames,
          errorImportPath,
        );
      }
    }
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
