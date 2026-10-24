import {
  phCliCommandNames,
  uniformRunnerCommandNames,
} from "@powerhousedao/shared/clis/command-names";

/** Whether ph-cmd hands `command` to the project's ph-cli. */
export function forwardsToPhCli(
  command: string | undefined,
  uniformRunners: boolean,
): boolean {
  if (!command) return false;
  if (!(phCliCommandNames as readonly string[]).includes(command)) return false;
  return uniformRunners || !uniformRunnerCommandNames.has(command);
}
