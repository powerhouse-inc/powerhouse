import { posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { portleBinDir, resolveBinaries } from "../src/binaries.js";

const { join } = posix;
const home = "/home/u";
const binDir = portleBinDir(home, "linux");

describe("resolveBinaries", () => {
  it("prefers the explicit env path and tries nothing else", () => {
    const found = resolveBinaries({
      env: { PORTLE_FRPC_BIN: "/opt/frpc", PATH: "/usr/bin" },
      home,
      platform: "linux",
      exists: (p) => p === "/opt/frpc" || p === "/usr/bin/caddy",
    });
    expect(found.frpc).toBe("/opt/frpc");
    expect(found.caddy).toBe("/usr/bin/caddy");
    expect(found.searched).toEqual([
      "/opt/frpc",
      join(binDir, "caddy"),
      "/usr/bin/caddy",
    ]);
  });

  it("reports an explicit path that does not exist as missing", () => {
    const found = resolveBinaries({
      env: { PORTLE_CADDY_BIN: "/nope" },
      home,
      platform: "linux",
      exists: () => false,
    });
    expect(found.caddy).toBeNull();
    expect(found.searched).toContain("/nope");
  });

  it("looks in ~/.ph/portle/bin before the PATH, with .exe on Windows", () => {
    const found = resolveBinaries({
      env: { Path: "C:\\tools;C:\\other" },
      home: "C:\\Users\\w",
      platform: "win32",
      exists: (p) =>
        p === "C:\\Users\\w\\.ph\\portle\\bin\\frpc.exe" ||
        p === "C:\\other\\caddy.exe",
    });
    expect(found.frpc).toBe("C:\\Users\\w\\.ph\\portle\\bin\\frpc.exe");
    expect(found.caddy).toBe("C:\\other\\caddy.exe");
    expect(found.searched).toContain(win32.join("C:\\tools", "caddy.exe"));
  });

  it("is null for both when nothing is installed", () => {
    const found = resolveBinaries({
      env: { PATH: "" },
      home,
      platform: "linux",
      exists: () => false,
    });
    expect(found).toEqual({
      frpc: null,
      caddy: null,
      searched: [join(binDir, "frpc"), join(binDir, "caddy")],
    });
  });
});
