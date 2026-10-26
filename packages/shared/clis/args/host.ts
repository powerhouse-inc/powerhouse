import { option, optional, positional, string } from "cmd-ts";

// `ph host check` (FEATURE_UNIFORM_RUNNERS_ENABLED); ph-cli registers it, ph-cmd's help describes it.
export const hostCheckArgs = {
  host: positional({
    type: string,
    displayName: "host",
    description: "the host to check (a directory under hosts/)",
  }),
  // Not --env-file: node takes that flag even after the script name.
  envFile: option({
    type: optional(string),
    long: "env",
    description:
      "check against this env file alone instead of the project .env and the process env",
  }),
  verb: option({
    type: optional(string),
    long: "verb",
    description: "the verb to check at (default: run)",
  }),
};
