import { format } from "prettier";
import type { SourceFile } from "ts-morph";

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
