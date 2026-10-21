import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { sep } from "node:path";

const write = fs.writeFileSync;
const root = fs.realpathSync(process.cwd()) + sep;
fs.writeFileSync = (...args) => {
  const path = String(args[0]);
  if (path.startsWith(root) && path.includes(".ph-preflight-"))
    process.stderr.write("PH-PREFLIGHT-PACKAGE-WRITE\n");
  return write(...args);
};
syncBuiltinESMExports();
