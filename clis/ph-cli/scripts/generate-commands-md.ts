import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

/**
 * Generate COMMANDS.md file from the help texts in help.ts
 */
async function generateCommandsMd() {
  try {
    // Define paths for ES modules
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const rootDir = path.resolve(__dirname, "..");
    const helpFilePath = path.join(rootDir, "src", "help.ts");
    const outputPath = path.join(rootDir, "COMMANDS.md");

    // Read the help.ts file
    const helpFileContent = fs.readFileSync(helpFilePath, "utf8");

    // Extract all help text constants using regex
    const helpTextRegex = /export const (\w+)Help = `([\s\S]+?)`;/g;
    const commands: { name: string; content: string }[] = [];

    let match;
    while ((match = helpTextRegex.exec(helpFileContent)) !== null) {
      const commandName = match[1];
      const helpContent = match[2];
      commands.push({ name: commandName, content: helpContent });
    }

    // Sort commands alphabetically
    commands.sort((a, b) => a.name.localeCompare(b.name));

    // Generate the markdown content
    let markdown = "# Powerhouse CLI Commands\n\n";
    markdown +=
      "This document provides detailed information about the available commands in the Powerhouse CLI.\n\n";
    markdown += "## Table of Contents\n\n";

    // Add table of contents
    commands.forEach((command) => {
      const displayName = formatCommandName(command.name);
      const anchor = displayName.toLowerCase().replace(/\s+/g, "-");
      markdown += `- [${displayName}](#${anchor})\n`;
    });

    markdown += "\n";

    // Add command details
    commands.forEach((command) => {
      const displayName = formatCommandName(command.name);
      markdown += `## ${displayName}\n\n`;
      markdown += "```\n";
      markdown += command.content.trim();
      markdown += "\n```\n\n";
    });

    // Add footer
    markdown += "---\n\n";
    markdown +=
      "*This document was automatically generated from the help text in the codebase.*\n";

    // Write to COMMANDS.md
    fs.writeFileSync(outputPath, markdown);

    console.log(`✅ COMMANDS.md has been generated at ${outputPath}`);
  } catch (error) {
    console.error("Failed to generate COMMANDS.md:", error);
    process.exit(1);
  }
}

/**
 * Format command name for display (e.g., "setupGlobals" -> "Setup Globals")
 */
function formatCommandName(commandName: string): string {
  // Convert camelCase to separate words with spaces
  const name = commandName.replace(/([A-Z])/g, " $1").trim();
  // Capitalize first letter and convert the rest to lowercase
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Run the script
generateCommandsMd();
