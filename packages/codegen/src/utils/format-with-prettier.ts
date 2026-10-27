import {
  externalDevDependencies,
  spawnAsync,
} from "@powerhousedao/shared/clis";
import { format as oxfmtFormat } from "oxfmt";
import type { SourceFile } from "ts-morph";

const FORMAT_OPTIONS = { printWidth: 80 } as const;

/** Formats the text of a ts-morph source file with oxfmt before writing the text to memory */
export async function formatSourceFileWithPrettier(sourceFile: SourceFile) {
  sourceFile.organizeImports();
  const sourceText = sourceFile.getFullText();
  const formattedText = await formatFileText(
    sourceFile.getBaseName(),
    sourceText,
  );
  sourceFile.replaceWithText(formattedText);
}

const EXT_MAP: Record<string, string> = {
  typescript: ".ts",
  tsx: ".tsx",
  json: ".json",
  html: ".html",
  css: ".css",
  babel: ".js",
  markdown: ".md",
  graphql: ".graphql",
};

export async function formatSafe(
  sourceText: string,
  parser = "typescript",
): Promise<string> {
  return formatFileText(`file${EXT_MAP[parser] ?? ".ts"}`, sourceText);
}

/** Formats text as oxfmt formats a file of that name; a .tsx file must not parse as .ts. */
export async function formatFileText(
  fileName: string,
  sourceText: string,
): Promise<string> {
  try {
    const result = await oxfmtFormat(fileName, sourceText, FORMAT_OPTIONS);
    if (result.errors.length > 0) {
      console.error(
        `[codegen] could not format ${fileName}:`,
        result.errors.map((error) => error.message).join("\n"),
      );
      return sourceText;
    }
    return result.code;
  } catch (error) {
    console.error(error);
    return sourceText;
  }
}

/** JSON text as the project's formatter writes `fileName`. */
export async function formatJson(fileName: string, value: unknown) {
  return formatFileText(fileName, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Formats the current working directory with the pinned oxfmt version.
 * The pin matters when the project was scaffolded with skipInstall: with no
 * local oxfmt, a bare `npx oxfmt` downloads the latest release, whose
 * behavior can drift from the version the boilerplate depends on.
 */
export async function runOxfmt() {
  // oxfmt honours parent .gitignore files up to the git root, so a project
  // without its own repo inside an ignored directory matches no files.
  await spawnAsync("npx", [
    `oxfmt@${externalDevDependencies.oxfmt}`,
    "--no-error-on-unmatched-pattern",
    ".",
  ]);
}
