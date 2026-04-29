import {
  exportPaths,
  nonStandardExportPaths,
  rootExportPaths,
} from "file-builders";
import { flatMap, fromEntries } from "remeda";

export function makePackageJsonExports(): Record<string, ExportPaths | string> {
  const standardExportPaths = fromEntries(
    flatMap(exportPaths, (p) => makePackageJsonExport(p)),
  );
  return {
    ...rootExportPaths,
    ...standardExportPaths,
    ...nonStandardExportPaths,
  };
}

type ExportPaths = {
  types: string;
  browser: string;
  node: string;
};

function makePackageJsonExport(
  exportPath: string,
): [[string, ExportPaths], [string, ExportPaths]] {
  return [
    [
      `./${exportPath}`,
      {
        types: `./${exportPath}/dist/index.d.ts`,
        browser: `./${exportPath}/dist/browser/index.js`,
        node: `./${exportPath}/dist/node/index.mjs`,
      },
    ],
    [
      `./${exportPath}/*`,
      {
        types: `./${exportPath}/dist/*/index.d.ts`,
        browser: `./${exportPath}/dist/browser/*/index.js`,
        node: `./${exportPath}/dist/node/*/index.mjs`,
      },
    ],
  ];
}
