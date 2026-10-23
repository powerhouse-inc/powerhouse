import { join } from "path";
import {
  conditional,
  constant,
  filter,
  isIncludedIn,
  isNot,
  isString,
  map,
  pipe,
  split,
} from "remeda";
import { type Directory, type Project, type SourceFile } from "ts-morph";
import {
  getAllImportNames,
  getOrCreateDirectory,
  getStringArrayPropertyElements,
} from "utils";

function loadProcessorsDir(project: Project) {
  const { directory: processorsDir } = getOrCreateDirectory(
    project,
    "processors",
  );
  // The project starts without files, so load the ones discovery reads.
  project.addSourceFilesAtPaths([
    join(processorsDir.getPath(), "*.ts"),
    join(processorsDir.getPath(), "*", "*.ts"),
  ]);
  return processorsDir;
}

/** A folder holds a processor when it has the shape codegen gives one (a
 * `processor.ts`, a factory builder export, or the legacy class in `index.ts`),
 * or when `processors/connect.ts` or `switchboard.ts` registers it. */
function isProcessorDir(
  dir: Directory,
  registeredDirNames: readonly string[],
): boolean {
  if (registeredDirNames.includes(dir.getBaseName())) return true;
  if (dir.getSourceFile("processor.ts")) return true;
  const exportsFactoryBuilder = ["factory.ts", "index.ts"].some((fileName) =>
    [
      ...(dir.getSourceFile(fileName)?.getExportedDeclarations().keys() ?? []),
    ].some((name) => name.endsWith("FactoryBuilder")),
  );
  if (exportsFactoryBuilder) return true;
  return (
    dir
      .getSourceFile("index.ts")
      ?.getClasses()
      .some((c) => c.isExported()) ?? false
  );
}

function getProcessorDirs(project: Project) {
  const processorsDir = loadProcessorsDir(project);
  const registeredDirNames = [
    ...getProcessorNames(processorsDir.getSourceFile("connect.ts")),
    ...getProcessorNames(processorsDir.getSourceFile("switchboard.ts")),
  ];
  const dirs = processorsDir
    .getDirectories()
    .sort((a, b) => a.getBaseName().localeCompare(b.getBaseName()));
  return {
    processors: dirs
      .filter((dir) => isProcessorDir(dir, registeredDirNames))
      .map((dir) => dir.getBaseName()),
    others: dirs
      .filter((dir) => !isProcessorDir(dir, registeredDirNames))
      .map((dir) => dir.getBaseName()),
  };
}

/** Names of the `processors/` directories that hold a processor */
export function getProcessorDirNames(project: Project) {
  return getProcessorDirs(project).processors;
}

/** Names of the `processors/` directories that hold no processor, such as shared helpers */
export function getNonProcessorDirNames(project: Project) {
  return getProcessorDirs(project).others;
}

export function getProcessorMetadata(project: Project, dirName: string) {
  const { directory: processorsDir } = getOrCreateDirectory(
    project,
    "processors",
  );
  const { directory: processorDir } = getOrCreateDirectory(
    project,
    join("processors", dirName),
  );
  for (const [dir, fileName] of [
    [processorsDir, "connect.ts"],
    [processorsDir, "switchboard.ts"],
    [processorDir, "processor.ts"],
    [processorDir, "index.ts"],
    [processorDir, "factory.ts"],
  ] as const) {
    project.addSourceFileAtPathIfExists(join(dir.getPath(), fileName));
  }

  const connectProcessorNames = getProcessorNames(
    processorsDir.getSourceFile("connect.ts"),
  );

  const switchboardProcessorNames = getProcessorNames(
    processorsDir.getSourceFile("switchboard.ts"),
  );

  return pipe(dirName, (dirName) => ({
    processorName: dirName,
    /* We can try to determine which processors are for `connect` and for `switchboard`.
     * If we cannot, we fallback to including them in both. */
    processorApps: conditional(
      dirName,
      [isNot(isIncludedIn(connectProcessorNames)), constant(["switchboard"])],
      [isNot(isIncludedIn(switchboardProcessorNames)), constant(["connect"])],
      constant(["switchboard", "connect"]),
    ),
    processorType: pipe(
      // handle the old `index.ts` file name if `processor.ts` has not been generated
      processorDir.getSourceFile("processor.ts") ??
        processorDir.getSourceFile("index.ts"),
      getAllImportNames,
      // we have to check what type is imported to determine whether the processor is `relationalDb` or `analytics`
      conditional(
        [
          (specifiers) => isIncludedIn("RelationalDbProcessor", specifiers),
          constant("relationalDb"),
        ],
        [
          (specifiers) => isIncludedIn("IAnalyticsStore", specifiers),
          constant("analytics"),
        ],
        constant("analytics"),
      ),
    ),
    documentTypes: pipe(processorDir.getSourceFile("factory.ts"), (factory) =>
      // The factory template names the filter field `documentType`.
      getStringArrayPropertyElements(factory, "documentType").length > 0
        ? getStringArrayPropertyElements(factory, "documentType")
        : getStringArrayPropertyElements(factory, "documentTypes"),
    ),
  }));
}

/* The processor folders a factory builders file imports a `…FactoryBuilder`
 * from, as `processors/<dir>` or `./<dir>/…` */
const getProcessorNames = (sourceFile: SourceFile | undefined) =>
  pipe(
    sourceFile?.getImportDeclarations() ?? [],
    filter((declaration) =>
      declaration
        .getNamedImports()
        .some((n) => n.getName().endsWith("FactoryBuilder")),
    ),
    map((declaration) => declaration.getModuleSpecifierValue()),
    filter((specifier) =>
      ["processors/", "./"].some((prefix) => specifier.startsWith(prefix)),
    ),
    map(split("/")),
    map((s) => s.at(1)),
    filter(isString),
  );
