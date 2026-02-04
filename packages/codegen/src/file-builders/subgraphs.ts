import path from "path";
import { IndentationText, Project } from "ts-morph";

type MakeSubgraphsIndexFileArgs = { projectDir: string };
export async function makeSubgraphsIndexFile({
  projectDir,
}: MakeSubgraphsIndexFileArgs) {
  // use the local tsconfig.json file for a given project
  const tsConfigFilePath = path.join(projectDir, "tsconfig.json");

  const project = new Project({
    tsConfigFilePath,
    // don't add files from the tsconfig.json file, only use the ones we need
    skipAddingFilesFromTsConfig: true,
    // don't load library files, we only need the files we're adding
    skipLoadingLibFiles: true,
    // use formatting rules which match prettier
    manipulationSettings: {
      useTrailingCommas: true,
      indentationText: IndentationText.TwoSpaces,
    },
  });

  project.addSourceFilesAtPaths(`${projectDir}/subgraphs/**/*`);

  const subgraphsDir = project.getDirectory(path.join(projectDir, "subgraphs"));
  const subgraphsSubdirs = subgraphsDir?.getDirectories() ?? [];

  let subgraphsIndexSourceFile = project.getSourceFile(
    path.join(projectDir, "subgraphs/index.ts"),
  );
  if (!subgraphsIndexSourceFile) {
    subgraphsIndexSourceFile = project.createSourceFile(
      path.join(projectDir, "subgraphs/index.js"),
      "",
    );
  }

  for (const subgraphSubdir of subgraphsSubdirs) {
    const subgraphIndexSourceFilePath = `${subgraphSubdir.getPath()}/index.ts`;
    const subgraphIndexSourceFile = project.getSourceFile(
      subgraphIndexSourceFilePath,
    );
    if (!subgraphIndexSourceFile) {
      continue;
    }
    const subgraphClassExport = subgraphIndexSourceFile
      .getClasses()
      .find((c) => c.getBaseClass()?.getText().includes("BaseSubgraph"));
    const subgraphClassName = subgraphClassExport?.getName();
    if (!subgraphClassName) {
      continue;
    }
    const indexFileExports = subgraphsIndexSourceFile
      .getExportDeclarations()
      .map((e) => e.getNamespaceExport()?.getText())
      .filter((e) => e !== undefined)
      .join();
    if (indexFileExports.includes(subgraphClassName)) {
      continue;
    }
    subgraphsIndexSourceFile.addExportDeclaration({
      namespaceExport: subgraphClassName,
      moduleSpecifier: `./${subgraphSubdir.getBaseName()}/index.js`,
    });
  }

  await project.save();
}
