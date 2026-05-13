import { endsWith, filter, forEach, pipe, subtract } from "remeda";
import type { SourceFile } from "ts-morph";

export function updateVersionedImports(args: {
  sourceFile: SourceFile;
  version: number;
}) {
  const { sourceFile, version } = args;
  const previousVersion = subtract(version, 1);
  if (previousVersion < 1) return;

  const versionDir = `/v${version}`;
  const previousVersionDir = `/v${previousVersion}`;

  pipe(
    sourceFile.getImportDeclarations(),
    filter((i) =>
      endsWith(i.getModuleSpecifier().getLiteralValue(), previousVersionDir),
    ),
    forEach((i) =>
      i.setModuleSpecifier(
        i
          .getModuleSpecifier()
          .getLiteralValue()
          .replace(previousVersionDir, versionDir),
      ),
    ),
  );
}
