import { PGlite } from "@electric-sql/pglite";
import { NodeFS } from "@electric-sql/pglite/nodefs";
import { appendFileSync } from "node:fs";
import { createDurableNodeFs } from "../../src/pglite/durable-node-fs.js";

// argv: <dataDir> <ackFile> <fsync 0|1>. Every id whose INSERT was
// acknowledged is appended to ackFile before the next INSERT is issued.
const [dir, ackFile, fsyncFlag] = process.argv.slice(2);
if (!dir || !ackFile || !fsyncFlag) {
  console.error("usage: crash-child <dir> <ackFile> <0|1>");
  process.exit(1);
}

const pg = new PGlite({
  fs: createDurableNodeFs(NodeFS, dir, {
    fsync: fsyncFlag === "1",
    maintenanceIntervalMs: 0,
  }),
});

await pg.exec("CREATE TABLE crash_t (id int PRIMARY KEY, value text)");
process.stdout.write("ready\n");

let i = 1;
for (;;) {
  await pg.exec(`INSERT INTO crash_t VALUES (${i}, 'looping-${i}')`);
  appendFileSync(ackFile, `${i}\n`);
  i++;
}
