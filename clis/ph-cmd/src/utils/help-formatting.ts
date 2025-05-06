import { type Command } from "commander";
import {
  forwardPHCommand,
  getPackageManagerFromLockfile,
  getProjectInfo,
} from "./index.js";

// Configuration constants for help formatting
export const HELP_FORMATTING_CONFIG = {
  // Column width for command descriptions alignment
  FIXED_COLUMN_WIDTH: 55,
  // List of command names to apply padding to
  COMMANDS_TO_PAD: ["setup-globals", "init", "use", "update", "help"],
  // Padding to add before command descriptions for alignment
  DESCRIPTION_PADDING: "            ",
};

/**
 * Extracts command and description parts from a command line
 * @param {string} line - A line from the help text containing a command
 * @returns {{ cmd: string, desc: string }} Normalized command parts
 */
function extractCommandParts(line: string): { cmd: string; desc: string } {
  // First try to match a command with options and arguments
  let match =
    /^(\s+\S+(?:\|\S+)*(?:\s+\[options\])?(?:\s+\[[^\]]+\]|\s+<[^>]+>)*)(.*)$/.exec(
      line,
    );

  if (!match) {
    // Fallback to a simpler pattern
    match = /^(\s+\S+(?:\|\S+)*)(.*)$/.exec(line);
  }

  if (!match) {
    return { cmd: line, desc: "" };
  }

  return {
    cmd: match[1].trimEnd(),
    desc: match[2].trim(),
  };
}

/**
 * Formats a command with proper description alignment
 * @param {object} parts - Command parts with cmd and desc properties
 * @param {number} columnWidth - Fixed position for descriptions to start
 * @returns {string} Formatted command line
 */
function formatCommandLine(
  { cmd, desc }: { cmd: string; desc: string },
  columnWidth: number,
): string {
  // Calculate padding needed for alignment
  const padding = " ".repeat(Math.max(2, columnWidth - cmd.length));
  return `${cmd}${padding}${desc}`;
}

/**
 * Extracts command lines from help text starting from the Commands section
 * @param {string[]} lines - Help text split into lines
 * @param {number} startIndex - Index of the Commands section header
 * @returns {string[]} Array of command lines
 */
function extractCommandLines(lines: string[], startIndex: number): string[] {
  const commands: string[] = [];

  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop when we hit an empty line or no longer see command formatting
    if (!line.trim() || !/^\s{2}\S/.exec(line)) {
      break;
    }
    commands.push(line);
  }

  return commands;
}

/**
 * Merges CLI help text with the forwarded PH CLI help text
 * @param {string} cliHelp - Commander-generated help text
 * @param {string} forwardedHelp - Help text from the PH CLI
 * @returns {string} Merged help text
 */
export function mergeHelp(cliHelp: string, forwardedHelp: string): string {
  // Split help text into lines
  const cliLines = cliHelp.split("\n");
  const forwardedLines = forwardedHelp.split("\n");

  // Find the Commands section in both help texts
  const cliCommandsIndex = cliLines.findIndex(
    (line) => line.trim() === "Commands:",
  );
  const forwardedCommandsIndex = forwardedLines.findIndex(
    (line) => line.trim() === "Commands:",
  );

  // Extract command lines
  const cliCommands = extractCommandLines(cliLines, cliCommandsIndex);
  const forwardedCommands = extractCommandLines(
    forwardedLines,
    forwardedCommandsIndex,
  );

  // Create a set of CLI command names to avoid duplicates
  const cliCommandNames = new Set<string>();
  cliCommands.forEach((line) => {
    const match = /^\s+(\S+)(?:\|.*)?/.exec(line);
    if (match) cliCommandNames.add(match[1]);
  });

  // Filter out duplicate commands from forwarded help
  const uniqueForwardedCommands = forwardedCommands.filter((line) => {
    const match = /^\s+(\S+)(?:\|.*)?/.exec(line);
    if (!match) return false;

    // Explicitly filter out 'help' command from forwarded commands
    if (match[1] === "help") return false;

    return !cliCommandNames.has(match[1]);
  });

  // Process and format all commands
  const cliParts = cliCommands.map(extractCommandParts);
  const forwardedParts = uniqueForwardedCommands.map(extractCommandParts);

  // Format with consistent alignment
  const formattedCliCommands = cliParts.map((parts) =>
    formatCommandLine(parts, HELP_FORMATTING_CONFIG.FIXED_COLUMN_WIDTH),
  );
  const formattedForwardedCommands = forwardedParts.map((parts) =>
    formatCommandLine(parts, HELP_FORMATTING_CONFIG.FIXED_COLUMN_WIDTH),
  );

  // Extract header section
  const headerSection = cliLines.slice(0, cliCommandsIndex + 1).join("\n");

  // Combine all sections
  return [
    headerSection,
    formattedCliCommands.join("\n"),
    formattedForwardedCommands.join("\n"),
  ].join("\n");
}

/**
 * Applies padding to command descriptions for better alignment
 * @param {Command} program - Commander program instance
 */
export function applyCommandPadding(program: Command): void {
  program.commands.forEach((cmd) => {
    if (HELP_FORMATTING_CONFIG.COMMANDS_TO_PAD.includes(cmd.name())) {
      // Store original description in a property we can retrieve later
      const desc = cmd.description();
      // Add padding to the description
      cmd.description(HELP_FORMATTING_CONFIG.DESCRIPTION_PADDING + desc);
    }
  });
}

/**
 * Restores original command descriptions after generating help
 * @param {Command} program - Commander program instance
 */
export function restoreCommandDescriptions(program: Command): void {
  program.commands.forEach((cmd) => {
    if (HELP_FORMATTING_CONFIG.COMMANDS_TO_PAD.includes(cmd.name())) {
      const desc = cmd.description();
      cmd.description(desc.trim());
    }
  });
}

/**
 * Captures Commander help output as a string
 * @param {Command} program - Commander program instance
 * @returns {string} Help text as a string
 */
export function captureCommanderHelp(program: Command): string {
  let helpText = "";
  const originalConsoleLog = console.log;

  // Override console.log to capture output
  console.log = (...args) => {
    helpText += args.join(" ") + "\n";
  };

  program.outputHelp();

  // Restore console.log
  console.log = originalConsoleLog;

  return helpText;
}

/**
 * Generates and displays the merged help output
 * @param {Command} program - Commander program instance
 */
export async function generateMergedHelp(program: Command): Promise<void> {
  // Get project information
  const projectInfo = await getProjectInfo(undefined, false);

  if (projectInfo.available) {
    const packageManager = getPackageManagerFromLockfile(projectInfo.path);

    // Get forwarded help from PH CLI
    const forwardedHelp = forwardPHCommand(
      packageManager,
      projectInfo.path,
      "help",
      undefined,
      true,
    );

    // Apply padding to command descriptions for better alignment
    applyCommandPadding(program);

    // Capture the output without displaying it
    const helpText = captureCommanderHelp(program);

    // Restore original descriptions
    restoreCommandDescriptions(program);

    // Merge and display help
    const mergedHelp = mergeHelp(helpText, forwardedHelp);
    console.log(mergedHelp);
  } else {
    console.log(captureCommanderHelp(program));
  }
}
