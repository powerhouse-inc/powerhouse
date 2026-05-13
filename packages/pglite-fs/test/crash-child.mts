import { PGlite } from "@electric-sql/pglite";
import { AtomicNodeFs } from "../src/atomic-node-fs.js";

// child-process helper for the crash-recovery test. argv[2] is the host dir
// for the AtomicNodeFs snapshot. Writes a baseline row, signals readiness on
// stdout, then enters a tight INSERT loop so a SIGKILL from the parent has a
// reasonable chance of landing mid-syncToFs (either before or after the
// snapshot.bin.tmp -> snapshot.bin rename).

const dir = process.argv[2];
if (!dir) {
  console.error("usage: crash-child <dir>");
  process.exit(1);
}

const pg = new PGlite({ fs: new AtomicNodeFs(dir) });

await pg.exec("CREATE TABLE crash_t (id int PRIMARY KEY, value text)");
await pg.exec(
  "INSERT INTO crash_t VALUES (1, 'baseline-1'), (2, 'baseline-2'), (3, 'baseline-3')",
);

// At this point the baseline rows have been committed and a snapshot.bin has
// been written. Anything after this point is "best-effort" durability.
process.stdout.write("ready\n");

let i = 100;
while (true) {
  await pg.exec(`INSERT INTO crash_t VALUES (${i}, 'looping-${i}')`);
  i++;
}
