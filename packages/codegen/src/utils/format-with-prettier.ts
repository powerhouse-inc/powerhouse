import { spawnAsync } from "@powerhousedao/shared/clis";
import { format } from "prettier";
import type { SourceFile } from "ts-morph";

/** Formats the text of a ts-morph source file with prettier before writing the text to memory */
export async function formatSourceFileWithPrettier(sourceFile: SourceFile) {
  const sourceText = sourceFile.getFullText();
  let formattedText = sourceText;
  try {
    formattedText = await format(sourceText, {
      parser: "typescript",
    });
  } catch (error) {
    console.error(error);
  }
  sourceFile.replaceWithText(formattedText);
}

export async function runPrettier() {
  await spawnAsync("npx", ["prettier", "--write", "."]);
}
