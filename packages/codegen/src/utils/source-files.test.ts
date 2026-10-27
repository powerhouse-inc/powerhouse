import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { getPreviousVersionSourceFile } from "./source-files.js";

function projectWithV1Test() {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(
    "/project/document-models/todo/v1/tests/general.test.ts",
    'describe("GeneralOperations", () => {});',
  );
  return project;
}

describe("getPreviousVersionSourceFile", () => {
  it("finds the previous version's file", () => {
    const file = getPreviousVersionSourceFile({
      project: projectWithV1Test(),
      version: 2,
      filePath: "/project/document-models/todo/v2/tests/general.test.ts",
    });
    expect(file?.getText()).toContain("GeneralOperations");
  });

  it("finds it from a path with Windows separators", () => {
    const file = getPreviousVersionSourceFile({
      project: projectWithV1Test(),
      version: 2,
      filePath: "\\project\\document-models\\todo\\v2\\tests\\general.test.ts",
    });
    expect(file?.getText()).toContain("GeneralOperations");
  });

  it("finds nothing for a path without a version folder", () => {
    const project = projectWithV1Test();
    project.createSourceFile("/project/tests/general.test.ts", "");
    const file = getPreviousVersionSourceFile({
      project,
      version: 2,
      filePath: "/project/tests/general.test.ts",
    });
    expect(file).toBeUndefined();
  });
});
