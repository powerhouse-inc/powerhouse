import { MIGRATION_GUIDE_URL } from "@powerhousedao/shared/clis/deprecations";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  removedFlagsError,
  sugarError,
  withoutHostError,
  type SugarArgSchemas,
} from "../src/utils/sugar-checks.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The host files of the scaffold, as far as the runner each names.
const STOCK: Record<string, object> = {
  connect: { runner: { module: "@powerhousedao/ph-cli/runners/connect" } },
  switchboard: {
    runner: { module: "@powerhousedao/ph-cli/runners/switchboard" },
  },
  dev: {
    runner: { module: "@powerhousedao/host-core/runners/compound" },
    children: {
      "dev-switchboard": { host: "switchboard" },
      "dev-connect": { host: "connect" },
    },
  },
  // The dev host of a project made before hosts/dev.
  vetra: {
    runner: { module: "@powerhousedao/host-core/runners/compound" },
    children: {
      "vetra-switchboard": { host: "switchboard" },
      "vetra-studio": { host: "connect" },
    },
  },
};

const OWN_RUNNER = { runner: { module: "./my-runner.js" } };

function makeProject(
  hosts: string[] = [],
  own: Record<string, object> = {},
): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-sugar-checks-"));
  temporary.push(dir);
  for (const host of hosts) {
    const hostDir = path.join(dir, "hosts", host);
    mkdirSync(hostDir, { recursive: true });
    const definition = {
      name: host,
      ...(own[host] ?? STOCK[host] ?? OWN_RUNNER),
    };
    writeFileSync(
      path.join(hostDir, "host.js"),
      `export default ${JSON.stringify(definition)};`,
    );
  }
  return dir;
}

const SCAFFOLD = ["connect", "switchboard", "dev"];
const LEGACY_SCAFFOLD = ["connect", "switchboard", "vetra"];

// The runners' own schemas, as `ph run` checks arguments against them.
async function schemas(): Promise<SugarArgSchemas> {
  const [switchboard, connect] = await Promise.all([
    import("@powerhousedao/ph-run/runners/switchboard"),
    import("@powerhousedao/ph-run/runners/connect"),
  ]);
  return { switchboard: switchboard.argsSchema, connect: connect.argsSchema };
}

describe("a project without the host is an error", () => {
  it.each([
    [["dev"], "ph dev"],
    [["dev", "--watch"], "ph dev"],
    [["dev", "dev"], "ph dev dev"],
    [["connect"], "ph connect"],
    [["connect", "studio"], "ph connect studio"],
    [["connect", "build"], "ph connect build"],
    [["connect", "preview"], "ph connect preview"],
    [["switchboard"], "ph switchboard"],
    [["switchboard", "--migrate"], "ph switchboard"],
  ])("%j without hosts/ names `ph migrate`", (args, typed) => {
    expect(withoutHostError(args, makeProject())).toBe(
      `This project has no hosts/ folder, so \`${typed}\` cannot run. Run \`ph migrate\` to add the host files.`,
    );
  });

  it("says the same of a hosts/ folder that holds no host", () => {
    const project = makeProject();
    mkdirSync(path.join(project, "hosts"));
    const error = withoutHostError(["dev"], project);
    expect(error).toMatch(
      /^hosts\/ exists at .+ but contains no <name>\/host\.js/,
    );
    expect(error).toContain(
      ", so `ph dev` cannot run. Run `ph migrate` to add the host files.",
    );
  });

  it("names the missing host file in a project with other hosts", () => {
    const project = makeProject(["switchboard", "connect"]);
    expect(withoutHostError(["dev"], project)).toBe(
      "This project has no hosts/dev/host.js, so `ph dev` cannot run. " +
        "`ph migrate` adds the host files to a project without hosts only: add hosts/dev/host.js to this one. " +
        `See ${MIGRATION_GUIDE_URL}`,
    );
    expect(withoutHostError(["switchboard"], project)).toBeUndefined();
    expect(withoutHostError(["connect", "build"], project)).toBeUndefined();
  });

  it("takes hosts/dev, or hosts/vetra in a project without hosts/dev, for `ph dev`", () => {
    for (const hosts of [SCAFFOLD, LEGACY_SCAFFOLD]) {
      expect(withoutHostError(["dev"], makeProject(hosts))).toBeUndefined();
    }
  });

  it("is silent for help, for `ph connect config` and for other commands", () => {
    const project = makeProject();
    for (const args of [
      ["dev", "--help"],
      // The Vetra Studio gateway, not the vetra host.
      ["vetra"],
      ["vetra", "--watch"],
      ["switchboard", "-h"],
      ["connect", "--help"],
      ["connect", "config"],
      ["connect", "config", "--get", "connect.renown.url"],
      ["run", "vetra"],
      ["build"],
      [],
    ]) {
      expect(withoutHostError(args, project)).toBeUndefined();
    }
  });
});

describe("a flag `ph run` has no argument for is an error", () => {
  it("names the verb a `ph switchboard` flag became", async () => {
    const argSchemas = await schemas();
    expect(removedFlagsError(["switchboard", "--migrate"], argSchemas)).toBe(
      "`ph switchboard --migrate` was removed in 6.4. Use `ph run switchboard migrate` instead.",
    );
    expect(
      removedFlagsError(["switchboard", "--migrate-status"], argSchemas),
    ).toBe(
      "`ph switchboard --migrate-status` was removed in 6.4. Use `ph run switchboard migrate-status` instead.",
    );
    expect(
      removedFlagsError(["switchboard", "--reset", "--yes"], argSchemas),
    ).toBe(
      "`ph switchboard --reset` was removed in 6.4. Use `ph run switchboard reset` instead.",
    );
    expect(removedFlagsError(["switchboard", "--dev"], argSchemas)).toBe(
      "`ph switchboard --dev` was removed in 6.4. Use `ph run switchboard dev` instead.",
    );
  });

  it("names one flag the runner does not take, and where it is set now", async () => {
    expect(
      removedFlagsError(
        ["connect", "studio", "--ignore-local"],
        await schemas(),
      ),
    ).toBe(
      "`ph connect studio --ignore-local` was removed in 6.4: `ph run connect dev` has no such argument. " +
        "Set what it configures in the host files under hosts/ instead. " +
        `See ${MIGRATION_GUIDE_URL}`,
    );
  });

  it("names several in one error", async () => {
    expect(
      removedFlagsError(
        ["dev", "--logs", "--port", "4001", "--ignore-local=true"],
        await schemas(),
      ),
    ).toBe(
      "The `ph dev` flags --logs, --port, --ignore-local were removed in 6.4: `ph run dev` has no such arguments. " +
        "Set what they configure in the host files under hosts/ instead. " +
        `See ${MIGRATION_GUIDE_URL}`,
    );
  });

  it("names `ph dev`'s verb as typed and in its replacement", async () => {
    expect(removedFlagsError(["dev", "dev", "--logs"], await schemas())).toBe(
      "`ph dev dev --logs` was removed in 6.4: `ph run dev dev` has no such argument. " +
        "Set what it configures in the host files under hosts/ instead. " +
        `See ${MIGRATION_GUIDE_URL}`,
    );
  });

  it("names hosts/vetra in the replacement where `ph dev` runs it", async () => {
    expect(
      removedFlagsError(
        ["dev", "--logs"],
        await schemas(),
        makeProject(LEGACY_SCAFFOLD),
      ),
    ).toBe(
      "`ph dev --logs` was removed in 6.4: `ph run vetra` has no such argument. " +
        "Set what it configures in the host files under hosts/ instead. " +
        `See ${MIGRATION_GUIDE_URL}`,
    );
  });

  it("passes what the runner takes, under its member name for `ph dev`", async () => {
    const argSchemas = await schemas();
    for (const args of [
      ["dev"],
      ["dev", "--switchboard-port", "4001", "--connect-port=3001"],
      ["dev", "--strictPort"],
      ["dev", "--restart"],
      ["dev", "--debug"],
      ["switchboard", "--port", "4001", "--db-path", "x.db"],
      ["switchboard", "migrate", "--db-path", "x.db"],
      ["connect", "--port", "3001", "--strictPort"],
      ["connect", "studio", "--open"],
      ["connect", "preview", "--port=4173"],
    ]) {
      expect(removedFlagsError(args, argSchemas)).toBeUndefined();
    }
  });

  it("passes a flag the runner retired: the runner says so itself", async () => {
    const argSchemas = await schemas();
    expect(removedFlagsError(["dev", "--watch"], argSchemas)).toBeUndefined();
    expect(
      removedFlagsError(["dev", "--disable-connect"], argSchemas),
    ).toBeUndefined();
    expect(
      removedFlagsError(["connect", "studio", "-w"], argSchemas),
    ).toBeUndefined();
  });

  it("is silent for help, for `ph connect config` and for `ph run`", async () => {
    const argSchemas = await schemas();
    expect(
      removedFlagsError(["dev", "--logs", "--help"], argSchemas),
    ).toBeUndefined();
    // `ph vetra` runs the studio host, whose runner checks its own.
    expect(removedFlagsError(["vetra", "--logs"], argSchemas)).toBeUndefined();
    expect(
      removedFlagsError(["connect", "config", "--json", "{}"], argSchemas),
    ).toBeUndefined();
    expect(
      removedFlagsError(["run", "vetra", "--logs"], argSchemas),
    ).toBeUndefined();
  });
});

describe("sugarError", () => {
  it("says the project lacks the host before it looks at a flag", async () => {
    await expect(
      sugarError(["switchboard", "--migrate"], makeProject()),
    ).resolves.toContain("Run `ph migrate` to add the host files.");
  });

  it("refuses a removed flag in a project with the host", async () => {
    await expect(
      sugarError(["switchboard", "--migrate"], makeProject(SCAFFOLD)),
    ).resolves.toBe(
      "`ph switchboard --migrate` was removed in 6.4. Use `ph run switchboard migrate` instead.",
    );
    await expect(
      sugarError(["dev", "--strictPort"], makeProject(SCAFFOLD)),
    ).resolves.toBeUndefined();
  });

  it("leaves the flags of a host on a runner of its own to that runner", async () => {
    await expect(
      sugarError(
        ["connect", "studio", "--ignore-local"],
        makeProject(SCAFFOLD, { connect: OWN_RUNNER }),
      ),
    ).resolves.toBeUndefined();
    await expect(
      sugarError(
        ["switchboard", "--migrate"],
        makeProject(SCAFFOLD, { switchboard: OWN_RUNNER }),
      ),
    ).resolves.toBeUndefined();
  });

  it("checks `ph dev` only when it is the compound over the stock runners", async () => {
    // A member on a runner of its own, or a compound of the project's own.
    await expect(
      sugarError(
        ["dev", "--logs"],
        makeProject(SCAFFOLD, { connect: OWN_RUNNER }),
      ),
    ).resolves.toBeUndefined();
    await expect(
      sugarError(["dev", "--logs"], makeProject(SCAFFOLD, { dev: OWN_RUNNER })),
    ).resolves.toBeUndefined();
    await expect(
      sugarError(["dev", "--logs"], makeProject(SCAFFOLD)),
    ).resolves.toContain("`ph dev --logs` was removed in 6.4");
  });

  it("checks `ph dev` the same where it runs hosts/vetra", async () => {
    await expect(
      sugarError(["dev", "--logs"], makeProject(LEGACY_SCAFFOLD)),
    ).resolves.toContain("`ph dev --logs` was removed in 6.4");
    await expect(
      sugarError(["dev", "--strictPort"], makeProject(LEGACY_SCAFFOLD)),
    ).resolves.toBeUndefined();
    await expect(
      sugarError(
        ["dev", "--logs"],
        makeProject(LEGACY_SCAFFOLD, { vetra: OWN_RUNNER }),
      ),
    ).resolves.toBeUndefined();
  });

  it("checks nothing of `ph vetra`, the Vetra Studio gateway", async () => {
    await expect(
      sugarError(["vetra", "--logs"], makeProject(SCAFFOLD)),
    ).resolves.toBeUndefined();
    await expect(sugarError(["vetra"], makeProject())).resolves.toBeUndefined();
  });

  it("says `ph reactor` is gone, unless the project has a host of that name", async () => {
    await expect(sugarError(["reactor"], makeProject(SCAFFOLD))).resolves.toBe(
      "`ph reactor` was removed in 6.4. Use `ph switchboard` or `ph run switchboard` instead.",
    );
    await expect(
      sugarError(["reactor"], makeProject(["reactor"])),
    ).resolves.toBeUndefined();
  });
});
