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
  /** @experimental Runs the release profile instead of the edit profile. */
  release: flag({
    type: boolean,
    long: "release",
    description:
      "Experimental: check as ph build --release does, with the release checks and host validation over every model. Writes nothing",
    defaultValue: () => false as const,
    defaultValueIsSerializable: true,
  }),
  /** @experimental Verifies the release approval without loading the project. */
  prepack: flag({
    type: boolean,
    long: "prepack",
    description:
      'Experimental: without loading the package, exit 0 when the release approval ph build --release wrote matches it, 1 when it does not, and 2 when it cannot be checked. For a "prepack" script, so npm publish stops too',
    defaultValue: () => false as const,
    defaultValueIsSerializable: true,
  }),
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
