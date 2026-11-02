import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { switchboardBootFactsFromEnv } from "../src/boot.mjs";

// Its own file: a .env loaded by an earlier import in this worker would mask a leak.
describe("switchboardBootFactsFromEnv", () => {
  const cwd = process.cwd();
  let dir: string | undefined;
  afterEach(() => {
    process.chdir(cwd);
    if (dir) rmSync(dir, { recursive: true, force: true });
    delete process.env.PH_BOOT_ENV_SENTINEL;
  });

  it("leaves process.env as it found it, with a .env in the cwd", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "sb-boot-env-"));
    writeFileSync(path.join(dir, ".env"), "PH_BOOT_ENV_SENTINEL=leaked\n");
    process.chdir(dir);
    const before = { ...process.env };
    await switchboardBootFactsFromEnv({}, { dev: false });
    expect(process.env.PH_BOOT_ENV_SENTINEL).toBeUndefined();
    expect({ ...process.env }).toEqual(before);
  });
});
