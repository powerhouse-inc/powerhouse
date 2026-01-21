import { packageManagerArgs } from "@powerhousedao/common/cli-args";
import { command } from "cmd-ts";

export const getPackageManagerCommand = command({
  name: "get-package-manager",
  args: packageManagerArgs,
  handler: (args) => args,
});
