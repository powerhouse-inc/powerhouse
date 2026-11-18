import { afterAll } from "bun:test";
import { realpathSync, writeFileSync } from "node:fs";

const origin = process.env.PH_COVERAGE_BUN_ORIGIN;
if (origin)
  afterAll(() => {
    writeFileSync(
      origin,
      JSON.stringify({ cwd: realpathSync(process.cwd()) }) + "\n",
    );
  });
