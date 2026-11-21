import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSkills } from "../src/dev/build-skills.js";
import { build as cliBuild, loadCli } from "../src/runners/cli-runner.js";
import { build as mastraBuild } from "../src/runners/mastra-runner.js";

// The skill build reads the package's `Cli`: a project whose `./cli` is the
// fixture Cli (a command and a service) and whose skill template names both.

const here = path.dirname(fileURLToPath(import.meta.url));
const CLINT_ROOT = path.resolve(here, "..");
const FIXTURES = path.join(here, "fixtures", "cli-runner");

const TEMPLATE = [
  "Greet with `{{commands.hello.id}}`: {{commands.hello.description}}.",
  "Argument name: {{commands.hello.params.name.description}} ({{commands.hello.params.name.type}}).",
  "Service {{services.db.id}} is {{services.db.name}}: {{services.db.description}}.",
  "Built for {{name}} {{version}}.",
].join("\n");

let root: string;

function link(target: string, at: string) {
  mkdirSync(path.dirname(at), { recursive: true });
  symlinkSync(target, at, process.platform === "win32" ? "junction" : "dir");
}

function write(file: string, content: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** A project with prompts/ and, when `withCli`, the fixture Cli as `./cli`. */
function makeProject(withCli: boolean): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-skill-build-"));
  write(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "skill-lab",
      type: "module",
      ...(withCli ? { exports: { "./cli": { node: "./cli/index.mjs" } } } : {}),
    }),
  );
  write(
    path.join(dir, "prompts", "skills-tpl", "greeting", ".preamble.md"),
    TEMPLATE,
  );
  write(
    path.join(dir, "prompts", "agent-profiles", "base.md"),
    "Agent {{name}}.",
  );
  if (withCli) {
    mkdirSync(path.join(dir, "cli"), { recursive: true });
    copyFileSync(
      path.join(FIXTURES, "skills-cli.mjs"),
      path.join(dir, "cli", "index.mjs"),
    );
    copyFileSync(
      path.join(FIXTURES, "commands.mjs"),
      path.join(dir, "cli", "commands.mjs"),
    );
    const modules = path.join(dir, "node_modules");
    link(CLINT_ROOT, path.join(modules, "@powerhousedao", "clint"));
    link(
      realpathSync(path.join(CLINT_ROOT, "node_modules", "zod")),
      path.join(modules, "zod"),
    );
  }
  return dir;
}

const quiet = () => undefined;
const skillMd = (dir: string) =>
  readFileSync(
    path.join(dir, "dist", "skills", "skills", "greeting", "SKILL.md"),
    "utf8",
  );

beforeEach(() => {
  root = "";
});
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("skill build and the package's Cli", () => {
  it("renders a template with the command's and the service's real metadata", async () => {
    root = makeProject(true);
    const cli = await loadCli(root);
    const result = await buildSkills({ rootDir: root, cli, logger: quiet });
    expect(result.warnings).toEqual([]);
    const md = skillMd(root);
    expect(md).toContain("Greet with `hello`: Print a greeting.");
    expect(md).toContain("Argument name: Who to greet (string).");
    expect(md).toContain(
      "Service db is Database: The project's PostgreSQL database.",
    );
    expect(md).toContain("Built for fixture-skills 0.0.1.");
    // prompts.skills gives the description, prompts.agents the profile
    expect(md).toContain(
      'description: "Greets people through the hello command"',
    );
    expect(
      readFileSync(
        path.join(root, "dist", "skills", "agent-profiles", "helper.md"),
        "utf8",
      ),
    ).toBe("Agent fixture-skills.\n");
  });

  it("the cli runner's build verb does the same, from the project's own export", async () => {
    root = makeProject(true);
    await cliBuild(
      {
        name: "cli",
        runner: { module: "@powerhousedao/clint/cli-runner" },
      } as never,
      { projectRoot: root } as never,
    );
    expect(skillMd(root)).toContain("Service db is Database:");
  });

  it("the mastra runner's build verb reads the Cli when the package exports one", async () => {
    root = makeProject(true);
    await mastraBuild(
      { name: "agent" } as never,
      { projectRoot: root } as never,
    );
    expect(skillMd(root)).toContain("Greet with `hello`: Print a greeting.");
  });

  it("builds as before without a ./cli export", async () => {
    root = makeProject(false);
    await mastraBuild(
      { name: "agent" } as never,
      { projectRoot: root } as never,
    );
    // the Cli's keys are missing: the paths alone drive the build
    expect(skillMd(root)).toContain("Greet with ``: .");
    expect(skillMd(root)).toContain('description: "Greeting tasks"');
  });
});
