// `npm run lint`, the type-aware oxlint the project's AGENTS.md has agents run
// after every change, on the scaffold and on one with a model, editor and app.
import { externalDevDependencies } from "@powerhousedao/shared/clis";
import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NEW_PROJECT, WITH_EDITORS, WORKSPACE_DIR } from "../constants.js";

function lint(projectDir: string) {
  const result = spawnSync("bun", ["run", "--cwd", projectDir, "lint"], {
    encoding: "utf8",
  });
  const output = result.stdout + result.stderr;
  return {
    status: result.status,
    errors: output.split("\n").filter((line) => / error \w+\(/.test(line)),
  };
}

describe("npm run lint", () => {
  // The projects here lint with the monorepo's oxlint, so it must be theirs;
  // tsgolint 7.0.x type-checks with the TypeScript 7.0 the scaffold's tsc is.
  it("runs the oxlint and tsgolint the scaffold installs", () => {
    const { devDependencies } = JSON.parse(
      readFileSync(join(WORKSPACE_DIR!, "package.json"), "utf8"),
    ) as { devDependencies: Record<string, string> };
    const scaffolded: Record<string, string> = {
      oxlint: externalDevDependencies.oxlint,
      "oxlint-tsgolint": externalDevDependencies["oxlint-tsgolint"],
    };
    expect(scaffolded).toEqual({
      oxlint: devDependencies.oxlint,
      "oxlint-tsgolint": devDependencies["oxlint-tsgolint"],
    });
  });

  it("finds no errors in a fresh scaffold", () => {
    expect(lint(NEW_PROJECT)).toEqual({ status: 0, errors: [] });
  });

  it("finds no errors with generated document models, an editor and an app", () => {
    expect(lint(WITH_EDITORS)).toEqual({ status: 0, errors: [] });
  });
});
