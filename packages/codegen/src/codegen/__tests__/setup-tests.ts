import fs from "node:fs";
import path from "node:path";

const testDir = import.meta.dirname;
fs.rmSync(path.join(testDir, ".out"), { recursive: true, force: true });
fs.rmSync(path.join(testDir, ".test-project"), {
  recursive: true,
  force: true,
});
