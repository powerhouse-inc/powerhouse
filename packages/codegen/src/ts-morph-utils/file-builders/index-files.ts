import type { Project } from "ts-morph";
import { buildModulesOutputFilePath } from "../name-builders/common-files.js";

type MakeLegacyIndexFileArgs = {
  /** The project to make the legacy index file for */
  project: Project;
  /** The directory containing the module.ts files to generate from */
  modulesDirPath: string;
  modules: {
    unversionedName: string;
    versionedName: string | undefined;
    moduleSpecifier: string;
  }[];
};

/**
 * Makes a legacy index.ts file for the modules file which exports the modules as individual exports instead of an array of named exports.
 */
export function makeLegacyIndexFile({
  project,
  modulesDirPath,
  modules,
}: MakeLegacyIndexFileArgs) {
  const indexSourceFilePath = buildModulesOutputFilePath(
    modulesDirPath,
    "index.ts",
  );

  // get the source file for the index.ts file if it exists
  let indexSourceFile = project.getSourceFile(indexSourceFilePath);
  // if the index.ts file doesn't exist, create it
  if (!indexSourceFile) {
    indexSourceFile = project.createSourceFile(indexSourceFilePath, "");
  } else {
    indexSourceFile.replaceWithText("");
  }

  indexSourceFile.addExportDeclarations(
    modules.map(({ versionedName, unversionedName, moduleSpecifier }) => ({
      namedExports: [
        versionedName
          ? `${unversionedName} as ${versionedName}`
          : unversionedName,
      ],
      moduleSpecifier,
    })),
  );
}
