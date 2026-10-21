import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createDiagnostic } from "document-model";
import type * as BuildService from "../src/services/build.js";
import type * as BuilderTools from "@powerhousedao/builder-tools";
import { runConnectBuild } from "../src/services/connect-build.js";
import type { ConnectBuildArgs } from "../src/types.js";

vi.mock("../src/services/build.js", async (original) => ({
  ...(await original<typeof BuildService>()),
  runBuild: vi.fn(() =>
    Promise.resolve({
      status: "ok",
      exitCode: 0,
      report: {
        diagnostics: [
          createDiagnostic({
            code: "PH-SG-GENERATED-TYPE-TAKEN",
            path: [],
            message: "The scaffold type is already taken.",
            repair: "Rename the scaffold type.",
          }),
        ],
      },
    }),
  ),
}));
vi.mock("@powerhousedao/builder-tools", async (original) => ({
  ...(await original<typeof BuilderTools>()),
  prebuildConnectVendor: vi.fn(() =>
    Promise.reject(new Error("app build reached")),
  ),
}));
const enteredFrom = process.cwd();
const root = mkdtempSync(join(tmpdir(), "connect-warning-"));
afterEach(() => {
  process.chdir(enteredFrom);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
it("prints passing package-build warnings before building Connect", async () => {
  process.chdir(root);
  vi.stubEnv("PH_CONNECT_VENDOR", "1");
  const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  await expect(
    runConnectBuild({ outDir: "app" } as ConnectBuildArgs),
  ).rejects.toThrow("app build reached");
  expect(write.mock.calls.map(([text]) => text).join("")).toContain(
    "PH-SG-GENERATED-TYPE-TAKEN",
  );
});
