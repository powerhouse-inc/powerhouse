import { spawnAsync } from "@powerhousedao/shared/clis";
import { format, type BuiltInParserName, type LiteralUnion } from "prettier";
import type { SourceFile } from "ts-morph";

/** Formats the text of a ts-morph source file with prettier before writing the text to memory */
export async function formatSourceFileWithPrettier(sourceFile: SourceFile) {
  sourceFile.organizeImports();
  const sourceText = sourceFile.getFullText();
  const formattedText = await formatSafe(sourceText);
  sourceFile.replaceWithText(formattedText);
}

export async function formatSafe(
  sourceText: string,
  parser: LiteralUnion<BuiltInParserName, string> = "typescript",
) {
  try {
    const formattedText = await format(sourceText, {
      parser,
    });
    return formattedText;
  } catch (error) {
    console.error(error);
    return sourceText;
  }
}

export async function runOxfmt() {
  await spawnAsync("npx", ["oxfmt", "."]);
}
