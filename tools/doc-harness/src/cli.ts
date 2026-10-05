import { Command } from "commander";
import { register as registerCatalog } from "./commands/catalog.js";
import { register as registerExtract } from "./commands/extract.js";
import { register as registerInspect } from "./commands/inspect.js";
import { register as registerRecords } from "./commands/records.js";
import { register as registerReport } from "./commands/report.js";
import { register as registerRun } from "./commands/run.js";

const program = new Command()
  .name("doc-harness")
  .description(
    "Build recipes from the Academy docs alone with claude -p, then judge where the docs failed.",
  );

registerRun(program);
registerReport(program);
registerCatalog(program);
registerExtract(program);
registerRecords(program);
registerInspect(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
