import { packageManagerArgs } from "@powerhousedao/common/clis";
import { command } from "cmd-ts";

export const getPackageManagerCommand = command({
  name: "get-package-manager",
  args: packageManagerArgs,
  handler: (args) => args,
});
