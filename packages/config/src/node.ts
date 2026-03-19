import { type PowerhouseConfig } from "@powerhousedao/shared/clis";
import { writeFileSync } from "node:fs";
export { getConfig } from "@powerhousedao/shared/clis";

export function writeConfig(
  config: PowerhouseConfig,
  path = "./powerhouse.config.json",
) {
  writeFileSync(path, JSON.stringify(config, null, 4));
}
