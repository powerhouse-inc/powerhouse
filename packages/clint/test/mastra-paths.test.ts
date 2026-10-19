import { describe, it, expect } from "vitest";
import { join, resolve } from "node:path";
import { getMastraPaths } from "../src/integrations/mastra/paths.js";
import { createMemoryWorkdirStore } from "../src/core/store.js";

describe("getMastraPaths", () => {
  it("computes paths from a WorkdirStore", () => {
    const store = createMemoryWorkdirStore("/home/user/project", "assist");
    const paths = getMastraPaths(store);
    const workdir = resolve("/home/user/project");

    expect(paths.workspaceBasePath).toBe(workdir);
    expect(paths.rootFolder).toBe(join(workdir, ".ph", "assist", ".mastra"));
    expect(paths.dbFolder).toBe(
      join(workdir, ".ph", "assist", ".mastra", "db"),
    );
    expect(paths.dbPath).toBe(
      join(workdir, ".ph", "assist", ".mastra", "db", "mastra.db"),
    );
  });

  it("includes runtime skills glob by default", () => {
    const store = createMemoryWorkdirStore("/project", "mycli");
    const paths = getMastraPaths(store);
    const workdir = resolve("/project");

    expect(paths.skillPaths).toHaveLength(1);
    expect(paths.skillPaths[0]).toBe(
      join(workdir, ".ph", "mycli", "skills") + "/**",
    );
  });

  it("includes pre-packaged skill paths when specified", () => {
    const store = createMemoryWorkdirStore("/project", "mycli");
    const paths = getMastraPaths(store, {
      prePackagedSkills: ["skill-a", "skill-b"],
    });
    const workdir = resolve("/project");

    expect(paths.skillPaths).toHaveLength(3);
    expect(paths.skillPaths[0]).toBe(
      join(workdir, ".ph", "mycli", ".mastra", "skills", "skill-a"),
    );
    expect(paths.skillPaths[1]).toBe(
      join(workdir, ".ph", "mycli", ".mastra", "skills", "skill-b"),
    );
    expect(paths.skillPaths[2]).toBe(
      join(workdir, ".ph", "mycli", "skills") + "/**",
    );
  });

  it("computes allowedPaths for LocalFilesystem containment", () => {
    const store = createMemoryWorkdirStore("/project", "mycli");
    const paths = getMastraPaths(store);
    const workdir = resolve("/project");

    expect(paths.allowedPaths).toEqual([workdir]);
  });

  it("returns empty pre-packaged skills when option omitted", () => {
    const store = createMemoryWorkdirStore("/project", "mycli");
    const paths = getMastraPaths(store);

    // Only the runtime glob
    expect(paths.skillPaths).toHaveLength(1);
  });
});
