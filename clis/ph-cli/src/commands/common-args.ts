import { boolean, flag, optional } from "cmd-ts";

export const debugArgs = {
  debug: flag({
    type: optional(boolean),
    long: "debug",
    description: "Log arguments passed to this command",
  }),
};
