import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RunnerContext } from "@powerhousedao/host-core";
import type { SwitchboardConfigInput } from "@powerhousedao/switchboard/config";
import type * as SwitchboardServer from "@powerhousedao/switchboard/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as switchboardRunner from "../src/runners/switchboard.js";

/**
 * The package names in a package's switchboard `packages.list` (D5, C1 M2):
 * found from the package root, handed to the server by their real folders.
 * The server is stopped at its door: the test reads what it was given.
 */

const state = vi.hoisted(() => ({
  configs: [] as SwitchboardConfigInput[],
  NotStarted: class NotStarted extends Error {},
}));
const { NotStarted } = state;

vi.mock("@powerhousedao/switchboard/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SwitchboardServer>();
  return {
    ...actual,
    startSwitchboard: (config: SwitchboardConfigInput) => {
      state.configs.push(config);
      return Promise.reject(new state.NotStarted("not started"));
    },
  };
});

function write(file: string, source: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

const pkg = (dir: string, name: string) =>
  write(path.join(dir, "package.json"), JSON.stringify({ name }));

let base: string;
let project: string;
let tools: string;
let models: string;

beforeAll(() => {
  base = realpathSync(mkdtempSync(path.join(tmpdir(), "ph-sb-pkg-list-")));
  project = path.join(base, "lab");
  tools = path.join(base, "store", "tools");
  models = path.join(base, "store", "models");
  pkg(project, "lab");
  // @acme/tools has its dependencies to itself: one in its own folder, one
  // linked in from the store, as pnpm does. The project has neither.
  pkg(tools, "@acme/tools");
  pkg(path.join(tools, "node_modules", "plain-models"), "plain-models");
  pkg(models, "@acme/models");
  mkdirSync(path.join(tools, "node_modules", "@acme"), { recursive: true });
  symlinkSync(
    models,
    path.join(tools, "node_modules", "@acme", "models"),
    "junction",
  );
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true, maxRetries: 10 });
});

const host = (list: string[]) =>
  switchboardRunner.hostSchema.parse({
    name: "switchboard",
    runner: { module: "@powerhousedao/ph-cli/runners/switchboard", port: 0 },
    config: { switchboard: { packages: { disableLocal: true, list } } },
  });

/** The list the server is given for `list`, from a package's host or not. */
async function listGiven(
  list: string[],
  hostPackage?: RunnerContext["hostPackage"],
): Promise<string[] | undefined> {
  state.configs.length = 0;
  await expect(
    switchboardRunner.run(host(list), {
      projectRoot: project,
      ...(hostPackage ? { hostPackage } : {}),
      verb: "run",
      env: {},
    } satisfies RunnerContext),
  ).rejects.toBeInstanceOf(NotStarted);
  return state.configs.at(0)?.packages?.list;
}

describe("a package switchboard's packages.list", () => {
  it("resolves each package name from the package root to its real folder; paths stay", async () => {
    const elsewhere = path.join(base, "elsewhere");
    expect(
      await listGiven([tools, "plain-models", "@acme/models", elsewhere], {
        name: "@acme/tools",
        root: tools,
      }),
    ).toEqual([
      tools,
      path.join(tools, "node_modules", "plain-models"),
      models,
      elsewhere,
    ]);
  });

  it("keeps a project host's names as written", async () => {
    expect(await listGiven(["plain-models", "@acme/models"])).toEqual([
      "plain-models",
      "@acme/models",
    ]);
  });

  it("refuses a name the package does not have installed, naming both", async () => {
    state.configs.length = 0;
    await expect(
      switchboardRunner.run(host(["@acme/nope"]), {
        projectRoot: project,
        hostPackage: { name: "@acme/tools", root: tools },
        verb: "run",
        env: {},
      } satisfies RunnerContext),
    ).rejects.toThrow(
      /@acme\/tools\/hosts\/switchboard\/host\.js: config\.switchboard\.packages\.list names "@acme\/nope", which is not installed in @acme\/tools/,
    );
    expect(state.configs).toEqual([]);
  });
});
