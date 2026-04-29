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
  startsWith,
} from "remeda";
import { type Project, type SourceFile } from "ts-morph";
import {
  getAllImportModuleSpecifiers,
  getAllImportNames,
  getOrCreateDirectory,
  getStringArrayPropertyElements,
} from "utils";

export function getProcessorMetadata(project: Project, dirName: string) {
  const { directory: processorsDir } = getOrCreateDirectory(
    project,
    "processors",
  );
  const { directory: processorDir } = getOrCreateDirectory(
    project,
    join("processors", dirName),
  );

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
    documentTypes: getStringArrayPropertyElements(
      processorDir.getSourceFile("factory.ts"),
      "documentTypes",
    ),
  }));
}

const getProcessorNames = (sourceFile: SourceFile | undefined) =>
  pipe(
    sourceFile,
    getAllImportModuleSpecifiers,
    filter(startsWith("processors/")),
    map(split("/")),
    map((s) => s.at(1)),
    filter(isString),
  );
