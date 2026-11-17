import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { restoreChanges, writeChanges } from "../src/services/project-files.js";

it("restores deleted source bytes and executable permissions when a conversion is rolled back", () => {
  const root = mkdtempSync(join(tmpdir(), "ph-write-rollback-"));
  const source = join(root, "script.ts");
  const contents = "#!/usr/bin/env node\nconsole.log('kept');\n";
  try {
    writeFileSync(source, contents);
    chmodSync(source, 0o755);
    const originalMode = statSync(source).mode & 0o777;
    const backup = writeChanges(root, [{ path: "script.ts", after: null }]);
    expect(existsSync(source)).toBe(false);
    restoreChanges(root, backup);
    expect(readFileSync(source, "utf8")).toBe(contents);
    expect(statSync(source).mode & 0o777).toBe(originalMode);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
