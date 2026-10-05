import ts from "typescript";

/**
 * Type-checks one in-memory module against the package tsconfig and returns
 * its emitted declaration text. Used to hold the interface rule that a
 * finalized module and its tokens expose no reducer callback signature.
 */
export function emitDeclaration(source: string): {
  readonly declaration: string;
  readonly diagnostics: readonly string[];
} {
  const fixturePath = new URL("../declaration-emit-fixture.ts", import.meta.url)
    .pathname;
  const host = ts.createCompilerHost({}, true);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.readFile = (fileName) =>
    fileName === fixturePath ? source : readFile(fileName);
  host.fileExists = (fileName) =>
    fileName === fixturePath ? true : fileExists(fileName);
  const configPath = new URL("../../../tsconfig.json", import.meta.url)
    .pathname;
  const config = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        );
      },
    },
  );
  if (config === undefined) throw new Error("tsconfig.json did not parse");
  let declaration = "";
  const program = ts.createProgram(
    [fixturePath],
    {
      ...config.options,
      composite: false,
      incremental: false,
      declaration: true,
      emitDeclarationOnly: true,
      declarationMap: false,
      outDir: undefined,
      tsBuildInfoFile: undefined,
    },
    host,
  );
  const fixture = program.getSourceFile(fixturePath);
  if (fixture === undefined) throw new Error("fixture was not loaded");
  const diagnostics = program
    .getSemanticDiagnostics(fixture)
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    );
  program.emit(fixture, (fileName, text) => {
    if (fileName.endsWith(".d.ts")) declaration += text;
  });
  return { declaration, diagnostics };
}
