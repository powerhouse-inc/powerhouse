import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initRenown } from "../src/renown.js";

describe("initRenown storage", () => {
  const saved = process.env.PH_USER_DATA_DIR;
  let userData: string | undefined;

  afterEach(async () => {
    if (saved === undefined) delete process.env.PH_USER_DATA_DIR;
    else process.env.PH_USER_DATA_DIR = saved;
    if (userData) await rm(userData, { recursive: true, force: true });
  });

  it("keeps renown's user storage under PH_USER_DATA_DIR", async () => {
    userData = await mkdtemp(join(tmpdir(), "switchboard-renown-"));
    process.env.PH_USER_DATA_DIR = userData;
    await initRenown({ keypairPath: join(userData, ".ph", ".keypair.json") });
    expect(existsSync(join(userData, ".ph", ".renown.json"))).toBe(true);
  });
});
