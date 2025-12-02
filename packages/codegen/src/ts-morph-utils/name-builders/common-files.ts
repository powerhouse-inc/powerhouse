import path from "path";

export function buildModulesDirPath(projectDir: string, modulesDir: string) {
  return path.join(projectDir, modulesDir);
}

export function buildModulesSourceFilesPath(
  projectDir: string,
  modulesDir: string,
) {
  const modulesDirPath = buildModulesDirPath(projectDir, modulesDir);
  return path.join(modulesDirPath, "/**/*");
}

export function buildModulesOutputFilePath(
  modulesDirPath: string,
  outputFileName: string,
) {
  return path.join(modulesDirPath, outputFileName);
}

export function buildTsConfigFilePath(projectDir: string) {
  return path.join(projectDir, "tsconfig.json");
}
