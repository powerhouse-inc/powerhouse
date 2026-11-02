import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHILD_SCRIPT = path.join(__dirname, "wasm-tiering-child.mts");
const PACKAGE_DIR = path.resolve(__dirname, "../..");
const onNode24 = process.versions.node.split(".")[0] === "24";

type Comparison = { before: number; after: number };

type ChildReport = {
  applied: boolean;
  again: boolean;
  main: Comparison;
  worker: Comparison;
};

// A fresh process, since the vitest fork already runs with the flag.
async function runChild(): Promise<ChildReport> {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ["--import", "tsx", "--no-warnings", CHILD_SCRIPT],
    { cwd: PACKAGE_DIR, env: { ...process.env, NODE_OPTIONS: "" } },
  );
  return JSON.parse(stdout.trim()) as ChildReport;
}

describe("disableWasmWrapperTiering", () => {
  it.runIf(onNode24)(
    "keeps wasm-to-JS calls on the untiered wrapper in the process and its workers",
    async () => {
      const report = await runChild();

      expect(report.applied).toBe(true);
      expect(report.again).toBe(false);
      // The generic wrapper costs several times a tiered one per call.
      expect(report.main.after).toBeGreaterThan(2 * report.main.before);
      expect(report.worker.after).toBeGreaterThan(2 * report.worker.before);
    },
    60_000,
  );

  it.skipIf(onNode24)(
    "leaves other Node versions alone",
    async () => {
      const report = await runChild();
      expect(report.applied).toBe(false);
    },
    60_000,
  );
});
