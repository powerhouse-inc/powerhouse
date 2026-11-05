import { boolean, flag, option, optional, rest, string } from "cmd-ts";
import { debugArgs } from "./common.js";

export const publishArgs = {
  registry: option({
    type: optional(string),
    long: "registry",
    description:
      "Registry URL to publish to (overrides config and environment)",
  }),
  /** @experimental Refuses to publish a package without a current release approval. */
  requireApproval: flag({
    type: boolean,
    long: "require-approval",
    description:
      "Experimental: publish only when the release approval that ph build --release wrote matches this package; otherwise exit 1 before contacting the registry. Forwards only --tag, --access, --otp, --dry-run, --provenance, --json and --loglevel to npm, refuses npm configuration in the environment that selects another package (npm_config_workspace, npm_config_workspaces, npm_config_include_workspace_root), and publishes with --ignore-scripts so lifecycle scripts cannot change the files it checked",
    defaultValue: () => false as const,
    defaultValueIsSerializable: true,
  }),
  ...debugArgs,
  forwardedArgs: rest({
    displayName: "npm-args",
    description: "Extra arguments forwarded to npm publish (e.g. --tag dev)",
  }),
};
