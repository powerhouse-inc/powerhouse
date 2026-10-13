import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultUserDataDir,
  resolveUserDataPlaceholders,
} from "../src/placeholders.js";

describe("userData placeholders (desktop shape)", () => {
  it("defaults under the project .ph and honors PH_USER_DATA_DIR", () => {
    expect(defaultUserDataDir("/proj", {})).toBe(
      path.join("/proj", ".ph", "user-data"),
    );
    expect(defaultUserDataDir("/proj", { PH_USER_DATA_DIR: "/profile" })).toBe(
      "/profile",
    );
  });

  it("substitutes deeply without mutating the input", () => {
    const host = {
      reactor: {
        backends: {
          main: {
            storage: { kind: "path", dataDir: "${userData}/pglite" },
            readModel: { url: "${userData}/pglite" },
          },
        },
      },
      runner: { port: 4101 },
    };
    const out = resolveUserDataPlaceholders(host, "/data");
    expect(out.reactor.backends.main.storage.dataDir).toBe("/data/pglite");
    expect(out.reactor.backends.main.readModel.url).toBe("/data/pglite");
    expect(out.runner.port).toBe(4101);
    expect(host.reactor.backends.main.storage.dataDir).toBe(
      "${userData}/pglite",
    );
  });
});
