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
  const formattedText = await formatSafe(sourceText);
  sourceFile.replaceWithText(formattedText);
}

const EXT_MAP: Record<string, string> = {
  typescript: ".ts",
  json: ".json",
  html: ".html",
  css: ".css",
  babel: ".js",
  markdown: ".md",
};

export async function formatSafe(
  sourceText: string,
  parser = "typescript",
): Promise<string> {
  try {
    const ext = EXT_MAP[parser] ?? ".ts";
    const result = await oxfmtFormat(`file${ext}`, sourceText, FORMAT_OPTIONS);
    return result.code;
  } catch (error) {
    console.error(error);
    return sourceText;
  }
}

/**
 * Formats the current working directory with the pinned oxfmt version.
 * The pin matters when the project was scaffolded with skipInstall: with no
 * local oxfmt, a bare `npx oxfmt` downloads the latest release, whose
 * behavior can drift from the version the boilerplate depends on.
 */
export async function runOxfmt() {
  await spawnAsync("npx", [`oxfmt@${externalDevDependencies.oxfmt}`, "."]);
}
