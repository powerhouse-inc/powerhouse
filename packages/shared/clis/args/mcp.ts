import { number, option, optional, string } from "cmd-ts";
import { debugArgs } from "./common.js";

export const mcpArgs = {
  projectDir: option({
    type: optional(string),
    long: "project-dir",
    description:
      "Powerhouse project to serve. Defaults to the nearest directory above the working directory that holds powerhouse.config.json.",
  }),
  startTimeout: option({
    type: number,
    long: "start-timeout",
    description:
      "Seconds to wait for Vetra to answer /ready after starting it on the first tool call",
    defaultValue: () => 120,
    defaultValueIsSerializable: true,
  }),
  ...debugArgs,
};
