import {
  boolean,
  flag,
  oneOf,
  option,
  optional,
  positional,
  string,
} from "cmd-ts";
import { debugArgs } from "./common.js";

export const KEYFRAMES_ACTIONS = [
  "preview",
  "clean",
  "status",
  "cancel",
  "reclaim",
] as const;

export const keyframesArgs = {
  action: positional({
    type: oneOf(KEYFRAMES_ACTIONS),
    displayName: "action",
    description:
      "preview: report what a clean-up would remove, without writing. clean: apply the configured keep and remove the keyframes of deleted documents (needs --yes). status: show the latest run and reclaim. cancel: stop a running clean-up. reclaim: rewrite the Keyframe table to give the space back to the disk.",
  }),
  url: option({
    type: optional(string),
    long: "url",
    description:
      "The switchboard's GraphQL endpoint, e.g. http://localhost:4001/graphql. Defaults to reactor.port in powerhouse.config.json.",
  }),
  token: option({
    type: optional(string),
    long: "token",
    description:
      "Admin bearer token. Defaults to PH_ACCESS_TOKEN, then a token from your `ph login` identity. Its address must be in the host's auth admins.",
  }),
  yes: flag({
    type: optional(boolean),
    long: "yes",
    description: "Run a clean or a reclaim without asking.",
  }),
  json: flag({
    type: optional(boolean),
    long: "json",
    description: "Print the result as JSON.",
  }),
  ...debugArgs,
};
