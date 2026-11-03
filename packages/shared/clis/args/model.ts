import { boolean, flag, optional, positional, string } from "cmd-ts";
import { debugArgs } from "./common.js";

const json = flag({
  type: boolean,
  long: "json",
  description: "Print exactly one JSON report on stdout and nothing else",
  defaultValue: () => false as const,
  defaultValueIsSerializable: true,
});

/**
 * @experimental Arguments of `ph model check`. Experimental while code-first
 * projects are introduced.
 */
export const modelCheckArgs = {
  json,
  ...debugArgs,
};

/**
 * @experimental Arguments of `ph model inspect`. Experimental while code-first
 * projects are introduced.
 */
export const modelInspectArgs = {
  selector: positional({
    type: optional(string),
    displayName: "documentType@version",
    description:
      "Inspect one model version, such as acme/invoice@1 (default: every model)",
  }),
  json,
  ...debugArgs,
};
