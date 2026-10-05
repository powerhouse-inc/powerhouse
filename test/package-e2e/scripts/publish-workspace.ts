import path from "node:path";
import { fileURLToPath } from "node:url";
import { publishWorkspacePackages } from "@powerhousedao/e2e-utils";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");

publishWorkspacePackages({ workspaceRoot: WORKSPACE_ROOT }).catch(
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
