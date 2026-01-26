import type { CommandHelpInfo, HelpTopic } from "@powerhousedao/codegen";
import { capitalCase, paramCase } from "change-case";
function groupHelpTopicsByCategory(helpTopics: HelpTopic[]) {
  const helpTopicsByCategory: Record<string, HelpTopic[] | undefined> = {};

  for (const helpTopic of helpTopics) {
    if (!helpTopicsByCategory[helpTopic.category]) {
      helpTopicsByCategory[helpTopic.category] = [helpTopic];
    } else {
      helpTopicsByCategory[helpTopic.category]?.push(helpTopic);
    }
  }

  return helpTopicsByCategory;
}

function makeTableOfContents(commandsHelpInfo: CommandHelpInfo[]) {
  const commandNames = commandsHelpInfo.map(({ name }) => name);
  const tableOfContentsEntries: string[] = [];

  for (const name of commandNames) {
    tableOfContentsEntries.push(
      `- [${capitalCase(name)}](#${paramCase(name)})\n`,
    );
  }

  return tableOfContentsEntries.join("");
}

function makeDefaultsDescriptors(defaults: string[]) {
  const withoutOptional = defaults.filter(
    (d) => d !== "optional" && d !== "[...optional]",
  );
  const formatted = withoutOptional.map((d) => {
    const [label, ...rest] = d.split(":").map((s) => s.trim());
    return `**${label}**: \`${rest.join("")}\``;
  });
  return formatted;
}

function makeRequiredDescriptor(defaults: string[]) {
  if (
    defaults.includes("optional") ||
    defaults.includes("[...optional]") ||
    defaults.some((d) => d.includes("default"))
  )
    return "";
  return "*[required]*";
}

function makeHeadingFromUsage(usage: string) {
  if (usage.includes("--")) {
    const usageAsWords = capitalCase(usage.split(" ")[0].replace("--", ""));
    return `#### ${usageAsWords}`;
  }
  const usageWithoutBrackets = capitalCase(
    usage.replace("[", "").replace("]", ""),
  );
  return `#### ${usageWithoutBrackets}`;
}
function makeCommandHelpTopicDocs(helpTopic: HelpTopic) {
  const { defaults, description, usage } = helpTopic;
  const heading = makeHeadingFromUsage(usage);
  const requiredDescriptor = makeRequiredDescriptor(defaults);
  const defaultsDescriptors = makeDefaultsDescriptors(defaults);

  return `${heading} ${requiredDescriptor}<br>
${description}<br><br>
**usage:** \`${usage}\`<br>
${defaultsDescriptors.join("<br>")}
`;
}

function makeCommandHelpTopicsDocs(helpTopics: HelpTopic[]) {
  return helpTopics.map(makeCommandHelpTopicDocs).join("");
}

function makeCommandHelpTopicsDocsForCategories(helpTopics: HelpTopic[]) {
  const helpTopicsByCategory = groupHelpTopicsByCategory(helpTopics);
  const helpTopicsDocs: string[] = [];

  for (const [category, helpTopics] of Object.entries(helpTopicsByCategory)) {
    const helpTopicDocs = makeCommandHelpTopicsDocs(helpTopics ?? []);

    helpTopicsDocs.push(
      `### ${category}
${helpTopicDocs}
`,
    );
  }

  return helpTopicsDocs.join("");
}

function makeCommandDoc(commandHelpInfo: CommandHelpInfo) {
  const { name, description, helpTopics } = commandHelpInfo;
  return `## ${capitalCase(name)}
${description}
${makeCommandHelpTopicsDocsForCategories(helpTopics)}`;
}

function makeCommandDocs(commandsHelpInfo: CommandHelpInfo[]) {
  return commandsHelpInfo.map(makeCommandDoc).join("");
}

export const docsFromCliHelpTemplate = (v: {
  cliDescription: string;
  commandsHelpInfo: CommandHelpInfo[];
  docsTitle: string;
  docsIntroduction: string;
}) =>
  `# ${v.docsTitle}<br>
${v.docsIntroduction}<br><br>
${v.cliDescription}<br>
## Table of Contents
${makeTableOfContents(v.commandsHelpInfo)}<br>
${makeCommandDocs(v.commandsHelpInfo)}
`;
