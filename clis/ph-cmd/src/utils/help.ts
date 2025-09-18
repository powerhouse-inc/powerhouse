import type { Command } from "commander";

/**
 * Helper to handle help flag detection for commands
 * This centralizes the pattern of checking for help flags and showing command-specific help
 *
 * @param command - The Command instance
 * @param actionFn - The original action function to call if help is not requested
 * @returns A wrapped action function
 */
export function withHelpHandler<T extends unknown[]>(
  command: Command,
  actionFn: (...args: T) => Promise<void> | void,
): (...args: T) => Promise<void> | void {
  return (...args: T) => {
    // Check if help was requested
    const rawArgs = process.argv;
    const isHelpRequested =
      rawArgs.includes("--help") || rawArgs.includes("-h");

    // If help was explicitly requested, show the help and exit
    if (isHelpRequested) {
      command.outputHelp();
      process.exit(0);
    }

    // Otherwise, run the original action
    return actionFn(...args);
  };
}

/**
 * Simplified utility to connect a command with an action function that includes help handling
 * This reduces boilerplate in command files by automatically setting up the action with help handling
 *
 * @param command - The Command instance
 * @param actionFn - The action function to call when the command is executed
 * @param preCheck - Optional validation function that runs before the action
 * @returns The command for chaining
 */
export function withHelpAction<T extends unknown[]>(
  command: Command,
  actionFn: (...args: T) => Promise<void> | void,
  preCheck?: (...args: T) => boolean | undefined,
): Command {
  command.action(
    withHelpHandler<T>(command, (...args: T) => {
      // If there's a pre-check function, run it before the action
      if (preCheck) {
        const result = preCheck(...args);
        // If the pre-check returns false explicitly, don't run the action
        if (result === false) return;
      }

      return actionFn(...args);
    }),
  );

  return command;
}

/**
 * Enhanced version of withHelpAction that allows custom help text without duplication
 *
 * @param command - The Command instance
 * @param actionFn - The action function to call when the command is executed
 * @param helpText - The custom help text to display (replacing the auto-generated help)
 * @param preCheck - Optional validation function that runs before the action
 * @returns The command for chaining
 */
export function withCustomHelp<T extends unknown[]>(
  command: Command,
  actionFn: (...args: T) => Promise<void> | void,
  helpText: string,
  preCheck?: (...args: T) => boolean | undefined,
): Command {
  // Clear any existing help text
  command.helpInformation = function () {
    const name = command.name();
    const args = command.usage();
    const description = command.description();

    // Create a minimal header
    let header = `\nUsage: ph ${name}`;
    if (args) header += ` ${args}`;
    if (description) header += `\n\n${description}\n`;

    // Return the custom help text
    return header + "\n" + helpText;
  };

  // Add help action handler
  return withHelpAction(command, actionFn, preCheck);
}
