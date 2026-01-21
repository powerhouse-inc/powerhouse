import { oneOf, optional, positional } from "cmd-ts";
import { debugArgs } from "./common.js";
import { SERVICE_ACTIONS } from "./constants.js";

export const serviceArgs = {
  action: positional({
    type: optional(oneOf(SERVICE_ACTIONS)),
  }),
  ...debugArgs,
};
