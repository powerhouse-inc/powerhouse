import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

/**
 * Generates combined CLI documentation from ph-cli and ph-cmd COMMANDS.md files
 * and injects it into the main 00-PowerhouseCLI.md documentation file.
 */
async function generateCombinedCliDocs() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Define paths
    const academyDocsDir = path.resolve(__dirname, "..", "docs", "academy", "04-APIReferences");
    const targetDocFile = path.join(academyDocsDir, "00-PowerhouseCLI.md");

    const phCliCommandsPath = path.resolve(__dirname, "..", "..", "..", "clis", "ph-cli", "COMMANDS.md");
    const phCmdCommandsPath = path.resolve(__dirname, "..", "..", "..", "clis", "ph-cmd", "COMMANDS.md");

    // Read COMMANDS.md files
    const phCliCommandsContent = fs.readFileSync(phCliCommandsPath, "utf8");
    const phCmdCommandsContent = fs.readFileSync(phCmdCommandsPath, "utf8");

    // Extract content after "## Table of Contents"
    const extractCommands = (content: string, cliName: string): string => {
      const tocHeader = "## Table of Contents";
      const tocIndex = content.indexOf(tocHeader);
      if (tocIndex === -1) {
        console.warn(`Warning: "## Table of Contents" not found in ${cliName} COMMANDS.md. Including entire file.`);
        return content;
      }
      let commandsSection = content.substring(tocIndex + tocHeader.length).trim();
      
      // Remove the auto-generation footer
      const footerRegex = /---\\n\\n\\\*This document was automatically generated from the help text in the codebase\\\.\\\*\\n?$/m;
      commandsSection = commandsSection.replace(footerRegex, "").trim();
      return commandsSection;
    };

    const phCliDocs = extractCommands(phCliCommandsContent, "ph-cli");
    const phCmdDocs = extractCommands(phCmdCommandsContent, "ph-cmd");

    // Prepare the combined markdown
    let combinedDocs = `### ph-cmd Commands\\n\\n${phCmdDocs}\\n\\n### ph-cli Commands\\n\\n${phCliDocs}`;

    // Read the target documentation file
    let targetDocContent = fs.readFileSync(targetDocFile, "utf8");

    // Replace the placeholder with the combined docs
    const startPlaceholder = "<!-- AUTO-GENERATED-CLI-COMMANDS-START -->";
    const endPlaceholder = "<!-- AUTO-GENERATED-CLI-COMMANDS-END -->";
    const startIndex = targetDocContent.indexOf(startPlaceholder);
    const endIndex = targetDocContent.indexOf(endPlaceholder);

    if (startIndex === -1 || endIndex === -1) {
      console.error(`Error: Placeholders not found in ${targetDocFile}. Please ensure the file contains:\\n${startPlaceholder}\\n...\\n${endPlaceholder}`);
      process.exit(1);
    }

    targetDocContent = 
      targetDocContent.substring(0, startIndex + startPlaceholder.length) +
      "\\n<!-- This content is automatically generated. Do not edit directly. -->\\n" +
      combinedDocs +
      "\\n" +
      targetDocContent.substring(endIndex);

    // Write the updated content back to the target file
    fs.writeFileSync(targetDocFile, targetDocContent);

    console.log(`✅ Combined CLI documentation has been generated at ${targetDocFile}`);

  } catch (error) {
    console.error("Failed to generate combined CLI documentation:", error);
    process.exit(1);
  }
}

// Run the script
generateCombinedCliDocs(); 