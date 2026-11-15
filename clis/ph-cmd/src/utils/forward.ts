import { phCliCommandNames } from "@powerhousedao/shared/clis/command-names";

/** Whether ph-cmd hands `command` to the project's ph-cli. */
export function forwardsToPhCli(command: string | undefined): boolean {
  if (!command) return false;
  return (phCliCommandNames as readonly string[]).includes(command);
}
