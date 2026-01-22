import type { CommandEntry, CommandHelpInfo } from "@powerhousedao/codegen";
import { docsFromCliHelpTemplate } from "@powerhousedao/codegen/templates";
import { writeFile } from "node:fs/promises";
import { stripVTControlCharacters } from "node:util";
export function getCommandHelpInfo<TEntry extends CommandEntry>(
  entry: TEntry,
): CommandHelpInfo {
  const name = entry.name;
  const description = entry.command.description ?? "";
  const helpTopics = entry.command.helpTopics?.() ?? [];
  return {
    name,
    description,
    helpTopics,
  };
}

export function getCommandsHelpInfo<TEntry extends CommandEntry>(
  entries: TEntry[],
) {
  return entries.map(getCommandHelpInfo);
}

export function makeCliDocsFromHelp<TEntry extends CommandEntry>(args: {
  cliDescription: string;
  docsTitle: string;
  docsIntroduction: string;
  entries: TEntry[];
}) {
  const { cliDescription, docsIntroduction, docsTitle, entries } = args;
  const commandsHelpInfo = getCommandsHelpInfo(entries);

  const template = docsFromCliHelpTemplate({
    cliDescription,
    docsIntroduction,
    docsTitle,
    commandsHelpInfo,
  });

  const templateWithAnsiEscapesRemoved = stripVTControlCharacters(template);

  return templateWithAnsiEscapesRemoved;
}

export async function writeCliDocsMarkdownFile<
  TEntry extends CommandEntry,
>(args: {
  filePath: string;
  cliDescription: string;
  docsTitle: string;
  docsIntroduction: string;
  entries: TEntry[];
}) {
  const { filePath, ...restArgs } = args;
  const markdownFileContent = makeCliDocsFromHelp(restArgs);

  await writeFile(filePath, markdownFileContent, {
    encoding: "utf-8",
  });
}
