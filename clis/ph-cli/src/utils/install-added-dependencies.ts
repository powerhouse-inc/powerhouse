import { boolean, flag, optional } from "cmd-ts";

export const skipInstallArgs = {
  skipInstall: flag({
    type: optional(boolean),
    long: "skip-install",
    description:
      "Don't install the dependencies the command adds to package.json",
  }),
};
