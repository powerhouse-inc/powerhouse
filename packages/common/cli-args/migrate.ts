import { boolean, flag, optional } from "cmd-ts";
import { debugArgs } from "./common.js";

export const migrateArgs = {
  useHygen: flag({
    type: optional(boolean),
    long: "use-hygen",
  }),
  ...debugArgs,
};
