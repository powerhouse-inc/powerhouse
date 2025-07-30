import { camelCase, paramCase, pascalCase } from "change-case";
import { type DocumentModelState, type OperationScope } from "document-model";
import fs from "fs/promises";
import path from "path";
import { Project, SyntaxKind, VariableDeclarationKind } from "ts-morph";

type Actions = {
  name: string | null;
  hasInput: boolean;
  hasAttachment: boolean | undefined;
  scope: OperationScope;
  state: string;
};

export class TSMorphGenerator {
  private project = new Project();
  private documentModelDir = "document-model";

  constructor(
    private rootDir: string,
    private docModels: DocumentModelState[],
  ) {}

  private async ensureDirectoryExists(dirPath: string) {
    try {
      await fs.mkdir(dirPath, { recursive: true }); // creates the full path if missing
    } catch (err) {
      console.error(`Failed to create directory: ${dirPath}`, err);
      throw err;
    }
  }

  private async setupProject() {
    await this.ensureDirectoryExists(this.rootDir);

    const sourcePath = `${this.rootDir}/**/*.ts`;
    this.project.addSourceFilesAtPaths(sourcePath);
  }

  async generateReducers() {
    await this.setupProject();

    for (const docModelState of this.docModels) {
      const latestSpec =
        docModelState.specifications[docModelState.specifications.length - 1];

      for (const module of latestSpec.modules) {
        const filteredModules = latestSpec.modules.filter(
          (m) => m.name === module.name,
        );

        const actions: Actions[] =
          filteredModules.length > 0
            ? filteredModules[0].operations.map((a) => ({
                name: a.name,
                hasInput: a.schema !== null,
                hasAttachment: a.schema?.includes(": Attachment"),
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                scope: a.scope || "global",
                state: a.scope === "global" ? "" : a.scope, // the state this action affects
                errors: a.errors,
              }))
            : [];

        const reducerFileName = `${paramCase(module.name)}.ts`;

        console.log(">>>reducerFileName", reducerFileName);

        const filePath = path.join(
          this.rootDir,
          this.documentModelDir,
          paramCase(docModelState.name),
          "src",
          "reducers",
          reducerFileName,
        );

        const sourceFile =
          this.project.addSourceFileAtPathIfExists(filePath) ??
          this.project.createSourceFile(filePath, "", { overwrite: false });

        // Add import statement
        const typeImportName = `${pascalCase(docModelState.name)}${pascalCase(module.name)}Operations`;
        const typeImportPath = `../../gen/${paramCase(module.name)}/operations.js`;

        const hasImport = sourceFile
          .getImportDeclarations()
          .some((imp) => imp.getModuleSpecifierValue() === typeImportPath);

        if (!hasImport) {
          sourceFile.addImportDeclaration({
            moduleSpecifier: typeImportPath,
            namedImports: [typeImportName],
            isTypeOnly: true,
          });
        }
        // Add import statement end

        const reducerName = "reducer";
        let reducerVar = sourceFile.getVariableDeclaration(reducerName);

        // If it doesn't exist, create it
        if (!reducerVar) {
          sourceFile.addVariableStatement({
            declarationKind: VariableDeclarationKind.Const,
            isExported: true,
            declarations: [
              {
                name: reducerName,
                type: typeImportName,
                initializer: "{}",
              },
            ],
          });

          reducerVar = sourceFile.getVariableDeclarationOrThrow(reducerName);
        } else {
          // If found, make sure the type is correct
          const typeNode = reducerVar.getTypeNode();
          if (!typeNode || typeNode.getText() !== typeImportName) {
            reducerVar.setType(typeImportName);
          }
        }

        const initializer = reducerVar.getInitializerIfKindOrThrow(
          SyntaxKind.ObjectLiteralExpression,
        );

        for (const action of actions) {
          const actionName = camelCase(action.name ?? "");
          if (!actionName) continue;

          const reducerFunctionName = `${actionName}Operation`;

          const existingProp = initializer.getProperty(reducerFunctionName);
          if (existingProp) continue;

          initializer.addMethod({
            name: reducerFunctionName,
            parameters: [
              { name: "state" },
              { name: "action" },
              { name: "dispatch" },
            ],
            statements: [
              `// TODO: Implement "${reducerFunctionName}" reducer`,
              `throw new Error('Reducer "${reducerFunctionName}" not yet implemented');`,
            ],
          });
        }

        await sourceFile.save();
      }
    }
  }
}
