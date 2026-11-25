import {
  boolean,
  flag,
  option,
  optional,
  restPositionals,
  string,
} from "cmd-ts";
import { debugArgs } from "./common.js";

const dataDir = option({
  type: optional(string),
  long: "data-dir",
  description:
    "The store's data folder (default: PH_USER_DATA_DIR, else the project)",
});

// `ph credentials list`.
export const credentialsListArgs = {
  dataDir,
  all: flag({
    type: optional(boolean),
    long: "all",
    description: "Also list withdrawn credentials",
  }),
  json: flag({
    type: optional(boolean),
    long: "json",
    description: "Print the records as JSON",
  }),
  ...debugArgs,
};

// `ph credentials withdraw`.
export const credentialsWithdrawArgs = {
  targets: restPositionals({
    type: string,
    displayName: "id | address | label",
    description: "Records to withdraw: an id prefix, an address or a label",
  }),
  expired: flag({
    type: optional(boolean),
    long: "expired",
    description: "Remove expired records and the tombstones of expired ones",
  }),
  dataDir,
  ...debugArgs,
};
