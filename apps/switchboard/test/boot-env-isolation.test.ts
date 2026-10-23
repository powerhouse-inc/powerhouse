import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { switchboardBootFactsFromEnv } from "../src/boot.mjs";

// Its own file: reactor-api's root must not have been imported in this worker yet.
describe("switchboardBootFactsFromEnv", () => {
  const cwd = process.cwd();
  let dir: string | undefined;
  afterEach(() => {
    process.chdir(cwd);
    if (dir) rmSync(dir, { recursive: true, force: true });
    delete process.env.PH_BOOT_ENV_SENTINEL;
  });

  it("leaves process.env as it found it, though reactor-api loads the cwd .env", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "sb-boot-env-"));
    writeFileSync(path.join(dir, ".env"), "PH_BOOT_ENV_SENTINEL=leaked\n");
    process.chdir(dir);
    const before = { ...process.env };
    await switchboardBootFactsFromEnv({}, { dev: false });
    expect(process.env.PH_BOOT_ENV_SENTINEL).toBeUndefined();
    expect({ ...process.env }).toEqual(before);
  });
});
