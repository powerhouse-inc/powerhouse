import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initRenown } from "../src/renown.js";

describe("initRenown: the instance key, and no user", () => {
  let userData: string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (userData) await rm(userData, { recursive: true, force: true });
  });

  it("writes no Renown user file, and its signer names no user", async () => {
    userData = await mkdtemp(join(tmpdir(), "switchboard-renown-"));
    const renown = await initRenown({
      keypairPath: join(userData, ".ph", ".keypair.json"),
      userDataDir: userData,
    });
    expect(existsSync(join(userData, ".ph", ".keypair.json"))).toBe(true);
    expect(existsSync(join(userData, ".ph", ".renown.json"))).toBe(false);
    expect(renown?.signer.user).toBeUndefined();
    expect(renown?.signer.app?.key).toMatch(/^did:key:/);
  });

  it("does not sign as a login from before 6.4, and says how to remove it", async () => {
    userData = await mkdtemp(join(tmpdir(), "switchboard-renown-"));
    await mkdir(join(userData, ".ph"), { recursive: true });
    const loginFile = join(userData, ".ph", ".renown.json");
    await writeFile(
      loginFile,
      JSON.stringify({
        user: {
          address: "0x1111111111111111111111111111111111111111",
          chainId: 1,
          networkId: "eip155",
        },
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const renown = await initRenown({
      keypairPath: join(userData, ".ph", ".keypair.json"),
      userDataDir: userData,
    });
    expect(renown?.signer.user).toBeUndefined();
    expect(
      warn.mock.calls.some((call) =>
        String(call[0]).includes("holds a Renown login from before"),
      ),
    ).toBe(true);
    expect(existsSync(loginFile)).toBe(true);
  });

  it("names the agent login, trusted keys and unsigned-write record from before 6.4, and keeps them", async () => {
    userData = await mkdtemp(join(tmpdir(), "switchboard-renown-"));
    const agent = join(userData, ".ph", "vetra", "agent");
    await mkdir(agent, { recursive: true });
    await writeFile(join(agent, ".renown.json"), JSON.stringify({ user: {} }));
    await writeFile(join(userData, ".ph", "preview-trusted-keys.json"), "{}");
    await mkdir(join(userData, ".ph", "unsigned-writes"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await initRenown({
      keypairPath: join(userData, ".ph", ".keypair.json"),
      userDataDir: userData,
    });
    const warned = warn.mock.calls
      .map((call) => call.map(String).join(" "))
      .find((line) =>
        line.includes("from before Powerhouse 6.4 and no longer read"),
      );
    expect(warned).toContain("ph migrate");
    expect(warned).toContain(agent);
    expect(warned).toContain("preview-trusted-keys.json");
    expect(warned).toContain("unsigned-writes");
    expect(existsSync(join(agent, ".renown.json"))).toBe(true);
    expect(existsSync(join(userData, ".ph", "unsigned-writes"))).toBe(true);
  });

  it("warns that identity.storagePath is no longer read", async () => {
    userData = await mkdtemp(join(tmpdir(), "switchboard-renown-"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await initRenown({
      keypairPath: join(userData, ".ph", ".keypair.json"),
      storagePath: join(userData, "elsewhere", ".renown.json"),
    });
    expect(
      warn.mock.calls.some((call) =>
        String(call[0]).includes("identity.storagePath is no longer read"),
      ),
    ).toBe(true);
    expect(existsSync(join(userData, "elsewhere", ".renown.json"))).toBe(false);
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
