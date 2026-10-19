import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultStoreDirs, resolvePhDir } from "./ph-dir.js";

describe("resolvePhDir", () => {
  it("is <base>/.ph classically and <userData>/.ph under a shell", () => {
    expect(resolvePhDir("/proj", {})).toBe(path.join("/proj", ".ph"));
    expect(resolvePhDir("/proj", { PH_USER_DATA_DIR: "/profile" })).toBe(
      path.join("/profile", ".ph"),
    );
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
