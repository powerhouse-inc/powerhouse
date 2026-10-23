import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkHost } from "@powerhousedao/host-core";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupProjects, makeProject } from "./host-check-project.js";

// Its own file: the switchboard boot check must not have run in this worker.
describe("checkHost with the switchboard runner", () => {
  const cwd = process.cwd();
  afterEach(() => {
    process.chdir(cwd);
    cleanupProjects();
    delete process.env.PH_HOST_CHECK_SENTINEL;
  });

  it("leaves process.env as it found it", async () => {
    const dir = makeProject({
      switchboard: {
        name: "lab-switchboard",
        runner: { module: "@powerhousedao/ph-cli/runners/switchboard" },
      },
    });
    const elsewhere = mkdtempSync(path.join(tmpdir(), "ph-host-check-cwd-"));
    writeFileSync(
      path.join(elsewhere, ".env"),
      "PH_HOST_CHECK_SENTINEL=leaked\n",
    );
    process.chdir(elsewhere);
    const before = { ...process.env };
    try {
      const result = await checkHost("switchboard", {
        projectRoot: dir,
        env: {},
      });
      expect(result.issues).toEqual([]);
      expect({ ...process.env }).toEqual(before);
    } finally {
      process.chdir(cwd);
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });
});
