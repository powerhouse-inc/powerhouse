import {
  boolean,
  flag,
  number,
  option,
  optional,
  positional,
  string,
} from "cmd-ts";
import { debugArgs } from "./common.js";

const url = option({
  type: optional(string),
  long: "url",
  description:
    "The host, as its consent page names it (default: this project's switchboard on localhost)",
});

const json = flag({
  type: optional(boolean),
  long: "json",
  description: "Print JSON for scripts",
});

const yes = flag({
  type: optional(boolean),
  long: "yes",
  short: "y",
  description: "Approve without asking (for scripts)",
});

const dataDir = option({
  type: optional(string),
  long: "data-dir",
  description:
    "The store's data folder (default: PH_USER_DATA_DIR, else the project)",
});

// `ph token create`.
export const tokenCreateArgs = {
  url,
  label: option({
    type: optional(string),
    long: "label",
    description:
      "What the session is called, as the operations it signs name it (default: ph token)",
  }),
  days: option({
    type: optional(number),
    long: "days",
    description: "How many days the token lives, 1 to 30 (default: 30)",
  }),
  replace: option({
    type: optional(string),
    long: "replace",
    description:
      "A session to withdraw once the new token is issued: its id (or a prefix) or label",
  }),
  yes,
  json,
  dataDir,
  ...debugArgs,
};

// `ph token approve`.
export const tokenApproveArgs = {
  code: positional({
    type: string,
    displayName: "code",
    description: "The code the device or tool shows, e.g. WXYZ-BCDF",
  }),
  url,
  yes,
  ...debugArgs,
};

// `ph token list`.
export const tokenListArgs = {
  url,
  json,
  dataDir,
  ...debugArgs,
};

// `ph token withdraw`.
export const tokenWithdrawArgs = {
  target: positional({
    type: string,
    displayName: "id | label",
    description: "The session to withdraw: its id (or a prefix) or its label",
  }),
  url,
  dataDir,
  ...debugArgs,
};
