import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultStoreDirs,
  legacyIdentityPaths,
  resolvePhDir,
} from "./ph-dir.js";

describe("resolvePhDir", () => {
  it("is <base>/.ph classically and <userData>/.ph under a shell", () => {
    expect(resolvePhDir("/proj", {})).toBe(path.join("/proj", ".ph"));
    expect(resolvePhDir("/proj", { PH_USER_DATA_DIR: "/profile" })).toBe(
      path.join("/profile", ".ph"),
    );
  });
});

describe("legacyIdentityPaths", () => {
  it("names what a .ph tree kept before 6.4, beside the switchboard's own key", () => {
    const ph = path.join("/proj", ".ph");
    expect(legacyIdentityPaths(ph)).toEqual({
      projectLogin: {
        file: path.join(ph, ".renown.json"),
        keypair: path.join(ph, ".keypair.json"),
      },
      agent: path.join(ph, "vetra", "agent"),
      agentLogin: {
        file: path.join(ph, "vetra", "agent", ".renown.json"),
        keypair: path.join(ph, "vetra", "agent", ".keypair.json"),
      },
      owner: path.join(ph, ".owner.json"),
      trustedKeys: [
        path.join(ph, "preview-trusted-keys.json"),
        path.join(ph, "vetra", "preview-trusted-keys.json"),
      ],
      unsignedWrites: path.join(ph, "unsigned-writes"),
    });
  });
});

describe("defaultStoreDirs", () => {
  it("returns the classic literals verbatim without a user-data root", () => {
    expect(defaultStoreDirs({})).toEqual({
      reactor: "./.ph/reactor-storage",
      readModel: ".ph/read-storage",
    });
  });

  it("keeps the same names inside ${userData}/.ph under a shell", () => {
    expect(defaultStoreDirs({ PH_USER_DATA_DIR: "/profile" })).toEqual({
      reactor: path.join("/profile", ".ph", "reactor-storage"),
      readModel: path.join("/profile", ".ph", "read-storage"),
    });
  });
});
