import { run as runCmdTs } from "cmd-ts";
import { ph } from "./commands/ph.js";

export async function run(args: string[]) {
  return await runCmdTs(ph, args);
}
