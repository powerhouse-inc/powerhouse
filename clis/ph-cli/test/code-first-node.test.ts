import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { createProject, readJson } from "./code-first-project.js";

const cli = join(import.meta.dirname, "..", "src", "cli.ts");
const tsx = pathToFileURL(
  createRequire(import.meta.url).resolve("tsx/esm"),
).href;

it("scaffolds a code-first model under Node's own module resolution", async () => {
  const dir = await createProject();
  try {
    const stdout = execFileSync(
      process.execPath,
      [
        "--import",
        tsx,
        cli,
        "generate",
        "document-model",
        "--code-first",
        "--name",
        "todo list",
      ],
      {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, PH_NO_TELEMETRY: "1" },
      },
    );
    expect(stdout.trim().split("\n").slice(-2)).toEqual([
      "Wrote powerhouse.manifest.json",
      'Generated editor "Todo List Editor" in editors/todo-list-editor',
    ]);
    expect(readJson(dir, "powerhouse.manifest.json")).toMatchObject({
      documentModels: [{ id: "acme-things/todo-list", name: "Todo List" }],
      editors: [{ id: "todo-list-editor" }],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 180_000);
