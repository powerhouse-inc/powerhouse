import { oneOf, optional, positional } from "cmd-ts";
import { SERVICE_ACTIONS } from "../constants.js";
import { debugArgs } from "./common.js";

export type { ServiceAction } from "../types.js";

export const serviceArgs = {
  action: positional({
    type: optional(oneOf(SERVICE_ACTIONS)),
  }),
  ...debugArgs,
};
