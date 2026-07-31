import {
  DEFAULT_PROJECT_OPTIONS,
  getOrCreateSourceFile,
} from "@powerhousedao/codegen/utils";
import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Project } from "ts-morph";

const SCAFFOLDED_STUB = `export const testDocBarOperations = {
  fooOperation(state, action) {
    // TODO: implement fooOperation reducer
    throw new Error("Reducer for 'fooOperation' not implemented.");
  },
};
`;

const HAND_WRITTEN = `export const testDocBarOperations = {
  fooOperation(state, action) {
    state.foo = action.input.foo;
  },
};
`;

const tmpDirs: string[] = [];

function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codegen-source-files-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

/** `ph vetra` keeps one Project for the whole process, so the tests below reuse
 * one instance — a fresh Project per run never goes stale and would pass unfixed. */
function buildLongLivedProject() {
  return new Project(DEFAULT_PROJECT_OPTIONS);
}

/** Stands in for one `ph vetra` codegen run: scaffold the reducer file and flush
 * it, leaving the SourceFile cached on the long-lived Project. */
function scaffoldAndSave(project: Project, filePath: string) {
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );
  expect(alreadyExists).toBe(false);
  sourceFile.replaceWithText(SCAFFOLDED_STUB);
  project.saveSync();
  expect(fs.readFileSync(filePath, "utf8")).toBe(SCAFFOLDED_STUB);
}

describe("getOrCreateSourceFile", () => {
  it("picks up edits made on disk after the file was cached", () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, "reducers", "bar.ts");
    const project = buildLongLivedProject();

    scaffoldAndSave(project, filePath);

    // The user replaces the TODO stub with a real reducer body, out of band.
    fs.writeFileSync(filePath, HAND_WRITTEN);

    const { alreadyExists, sourceFile } = getOrCreateSourceFile(
      project,
      filePath,
    );

    expect(alreadyExists).toBe(true);
    expect(sourceFile.getFullText()).toBe(HAND_WRITTEN);

    // The whole point: the next flush must not put the stub back.
    project.saveSync();
    expect(fs.readFileSync(filePath, "utf8")).toBe(HAND_WRITTEN);
  });

  it("treats a cached file deleted on disk as absent", () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, "reducers", "bar.ts");
    const project = buildLongLivedProject();

    scaffoldAndSave(project, filePath);

    fs.rmSync(filePath);

    const { alreadyExists, sourceFile } = getOrCreateSourceFile(
      project,
      filePath,
    );

    // Absent, so builders re-scaffold rather than resurrect text that is gone.
    expect(alreadyExists).toBe(false);
    expect(sourceFile.getFullText()).toBe("");
  });

  it("keeps unflushed in-memory work within a single run", () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, "reducers", "bar.ts");
    const project = buildLongLivedProject();

    const first = getOrCreateSourceFile(project, filePath);
    expect(first.alreadyExists).toBe(false);
    first.sourceFile.replaceWithText(SCAFFOLDED_STUB);

    // Same run, before any save: the in-memory copy is the newest state there
    // is, so refreshing from disk must not discard it.
    const second = getOrCreateSourceFile(project, filePath);

    expect(second.alreadyExists).toBe(true);
    expect(second.sourceFile.getFullText()).toBe(SCAFFOLDED_STUB);
  });
});
