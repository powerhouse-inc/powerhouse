import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initRenown } from "../src/renown.js";

describe("initRenown storage", () => {
  let userData: string | undefined;

  afterEach(async () => {
    if (userData) await rm(userData, { recursive: true, force: true });
  });

  it("keeps renown's user storage under the user-data dir", async () => {
    userData = await mkdtemp(join(tmpdir(), "switchboard-renown-"));
    await initRenown({
      keypairPath: join(userData, ".ph", ".keypair.json"),
      userDataDir: userData,
    });
    expect(existsSync(join(userData, ".ph", ".renown.json"))).toBe(true);
  });

  it("creates no .ph in cwd when the keypair path is explicit", async () => {
    userData = await mkdtemp(join(tmpdir(), "switchboard-renown-"));
    const cwd = join(userData, "project");
    await mkdir(cwd);
    const before = process.cwd();
    process.chdir(cwd);
    try {
      await initRenown({
        keypairPath: join(userData, ".ph", ".keypair.json"),
        userDataDir: userData,
      });
    } finally {
      process.chdir(before);
    }
    expect(existsSync(join(cwd, ".ph"))).toBe(false);
  });
});
