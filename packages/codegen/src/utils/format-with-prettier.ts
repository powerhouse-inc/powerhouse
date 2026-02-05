import { spawnAsync } from "@powerhousedao/common/clis";
import { format } from "prettier";
import type { SourceFile } from "ts-morph";

/** Formats the text of a ts-morph source file with prettier before writing the text to memory */
export async function formatSourceFileWithPrettier(sourceFile: SourceFile) {
  const sourceText = sourceFile.getFullText();
  const formattedText = await format(sourceText, {
    parser: "typescript",
  });
  sourceFile.replaceWithText(formattedText);
}

export async function runPrettier() {
  await spawnAsync("npx", ["prettier", "--write", "."]);
}
