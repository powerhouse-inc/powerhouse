import type { SourceFile } from "ts-morph";

export const GENERATE_MOCK_NAME = "generateMock";
export const GENERATE_MOCK_MODULE_SPECIFIER = "document-model/mock";

/**
 * Points every `generateMock` import at its subpath. An import that also
 * brings in other names keeps them where they are and gets a separate
 * `generateMock` import added.
 */
export function fixGenerateMockImports(sourceFile: SourceFile) {
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const namedImports = importDeclaration.getNamedImports();
    const generateMockSpecifier = namedImports.find(
      (namedImport) => namedImport.getName() === GENERATE_MOCK_NAME,
    );
    if (!generateMockSpecifier) continue;
    if (
      importDeclaration.getModuleSpecifierValue() ===
      GENERATE_MOCK_MODULE_SPECIFIER
    ) {
      continue;
    }

    const importsOnlyGenerateMock =
      namedImports.length === 1 &&
      !importDeclaration.getDefaultImport() &&
      !importDeclaration.getNamespaceImport();
    if (importsOnlyGenerateMock) {
      importDeclaration.setModuleSpecifier(GENERATE_MOCK_MODULE_SPECIFIER);
      continue;
    }

    const alias = generateMockSpecifier.getAliasNode()?.getText();
    generateMockSpecifier.remove();
    sourceFile.addImportDeclaration({
      namedImports: [{ name: GENERATE_MOCK_NAME, alias }],
      moduleSpecifier: GENERATE_MOCK_MODULE_SPECIFIER,
    });
  }
}

export function hasGenerateMockImport(sourceFile: SourceFile) {
  return sourceFile
    .getImportDeclarations()
    .some((importDeclaration) =>
      importDeclaration
        .getNamedImports()
        .some((namedImport) => namedImport.getName() === GENERATE_MOCK_NAME),
    );
}
