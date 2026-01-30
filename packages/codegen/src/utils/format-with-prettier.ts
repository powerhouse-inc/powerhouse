import { format } from "prettier";
import type { SourceFile } from "ts-morph";
import { spawnAsync } from "./spawn-async.js";

/** Formats the text of a ts-morph source file with prettier before writing the text to memory */
export function formatSourceFileWithPrettier(sourceFile: SourceFile) {
  const sourceText = sourceFile.getFullText();

  format(sourceText, {
    parser: "typescript",
  })
    .then((formattedText) => {
      sourceFile.replaceWithText(formattedText);
      sourceFile.saveSync();
    })
    .catch((error) => {
      console.error("Error formatting source file:", error);
    });
}

export async function runPrettier() {
  await spawnAsync("npx prettier", ["--write", "."]);
}
