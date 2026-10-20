import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { generateHostsFiles } from "../../codegen/generate-hosts.js";
import { buildPowerhouseConfigTemplate } from "../../templates/boilerplate/powerhouse.config.json.js";
import { tsConfigTemplate } from "../../templates/boilerplate/tsconfig.json.js";
import { writeGeneratedHostsFiles } from "./generated-project-files.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "ph-hosts-scaffold-"));
  temporary.push(dir);
  return dir;
}

describe("writeGeneratedHostsFiles", () => {
  it("scaffolds hosts/ and the agents/ stub on a fresh project", async () => {
    const dir = makeTempProject();
    await writeGeneratedHostsFiles(dir, "my-project");

    for (const file of [
      "hosts/README.md",
      "hosts/connect/host.js",
      "hosts/switchboard/host.js",
      "hosts/vetra/host.js",
      "hosts/desktop/host.js",
      "hosts/assistant/host.js",
      "hosts/cli/host.js",
      "agents/README.md",
      "agents/profiles.json",
      "agents/agent-profiles/AgentBase.md",
      "agents/skills-tpl/getting-started/00.describe-the-project.md",
      "agents/index.ts",
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(true);
    }

    const connect = readFileSync(join(dir, "hosts/connect/host.js"), "utf-8");
    expect(connect).toContain(`name: "my-project-connect"`);
    expect(connect).toContain("@powerhousedao/ph-cli/runners/connect");
    // ports are REFERENCED from powerhouse.config.json, never copied:
    expect(connect).toContain("config.studio?.port");
    expect(connect).toContain(
      `import config from "../../powerhouse.config.json" with { type: "json" }`,
    );
    // generic plugin enabled, carrying the drive-chrome config pointers:
    expect(connect).toContain("@powerhousedao/connect/plugins/generic");
    expect(connect).toContain("config.connect?.drives?.allowAddDrive");
    expect(connect).toContain("config.connect?.drives?.sections");
    expect(connect).toContain("config.connect?.drives?.icons");
    expect(connect).toContain("config.connect?.home?.background");
    // standalone Connect: its own worker reactor + a local default drive:
    expect(connect).toContain(`backends: {`);
    expect(connect).toContain(`kind: "worker"`);
    expect(connect).toContain(`slug: "powerhouse"`);

    const vetra = readFileSync(join(dir, "hosts/vetra/host.js"), "utf-8");
    expect(vetra).toContain(`defaultVerb: "dev"`);
    expect(vetra).toContain(`host: "connect"`);
    expect(vetra).toContain("config.vetra?.connectPort");
    // R4: generic compound + studio plugins (no vetra-specific runner).
    expect(vetra).toContain("@powerhousedao/host-core/runners/compound");
    expect(vetra).toContain("@powerhousedao/vetra-studio/switchboard");
    expect(vetra).toContain("@powerhousedao/vetra-studio/connect");
    expect(vetra).not.toContain("@powerhousedao/ph-cli/runners/compound");
    // workflow plugins: the connect member reads the Workflows drive URL
    // from the switchboard member's outputs (an output token)
    expect(vetra).toContain("@powerhousedao/connect/plugins/workflows");
    expect(vetra).toContain(
      `$output: { host: "switchboard", path: ["drives", "workflows", "url"] }`,
    );
    expect(vetra).not.toContain("from:");
    // the vetra switchboard serves the switchboard host's drives too, next to
    // the studio drives
    expect(vetra).toContain("...(switchboard.reactor.drives ?? [])");

    // P2.8: single-sourced protocol — the switchboard host references the
    // SAME connect.reactor block the connect host receives via its config.
    const switchboard = readFileSync(
      join(dir, "hosts/switchboard/host.js"),
      "utf-8",
    );
    expect(switchboard).toContain("protocol: config.connect?.reactor ?? {}");
    // the switchboard owns the project drive:
    expect(switchboard).toContain(`slug: "powerhouse"`);
    expect(connect).toContain(`appId: "inc.powerhouse.connect.my-project"`);

    // the desktop host runs on the PUBLISHED generic compound; ${userData}
    // must survive as a literal placeholder (resolved by the runner, not here)
    const desktop = readFileSync(join(dir, "hosts/desktop/host.js"), "utf-8");
    expect(desktop).toContain("@powerhousedao/desktop/runner");
    // the legacy .ph names under the user's root; the read model follows the
    // same root by default — never declared on the reactor's dir
    expect(desktop).toContain('dataDir: "${userData}/.ph/reactor-storage"');
    // backend kind is required: the switchboard member's reactor is in-process
    expect(desktop).toContain(`kind: "in-process"`);
    expect(desktop).not.toMatch(/readModel:\s*\{/);
    expect(desktop).toContain(`defaultVerb: "serve"`);
    expect(desktop).toContain("cspRegistrySync: true");
    expect(desktop).toContain(
      `$output: { host: "switchboard", path: ["drives", "workflows", "url"] }`,
    );
    expect(desktop).toContain(`path: ["drives", d.slug, "url"]`);
    expect(desktop).not.toContain("serverPort");
    // the switchboard side serves the runtime and its drive:
    expect(switchboard).toContain(
      "@powerhousedao/switchboard/plugins/workflows",
    );

    // P5.8: the agent rides the mastra runner, attached to the running
    // switchboard by its graphql endpoint output.
    const assistant = readFileSync(
      join(dir, "hosts/assistant/host.js"),
      "utf-8",
    );
    expect(assistant).toContain("@powerhousedao/clint/mastra-runner");
    expect(assistant).toContain(
      '$output: { host: "switchboard", path: ["endpoints", "graphql"] }',
    );
    expect(assistant).not.toContain("remote: { host");
    expect(assistant).not.toContain("workdir");
    expect(assistant).toContain('apiKey: { $env: "OPENROUTER_API_KEY" }');
    // cli: the generic compound over switchboard + Connect, Connect as a
    // REMOTE CLIENT (lone remote backend → reactorClient "remote", no PGlite).
    const cli = readFileSync(join(dir, "hosts/cli/host.js"), "utf-8");
    expect(cli).toContain("@powerhousedao/host-core/runners/compound");
    expect(cli).toContain('import switchboard from "../switchboard/host.js"');
    expect(cli).toContain('import connect from "../connect/host.js"');
    expect(cli).toContain('"cli-switchboard": { host: "switchboard" }');
    expect(cli).toContain(
      `$output: { host: "switchboard", path: ["drives", "workflows", "url"] }`,
    );
    expect(cli).toContain(`kind: "remote"`);
    expect(cli).toContain(
      '$output: { host: "switchboard", path: ["endpoints", "graphql"] }',
    );
    expect(cli).not.toContain("127.0.0.1");
    expect(cli).not.toContain("@powerhousedao/clint/clint-runner");
  });

  it("is preserve-on-migrate: never clobbers an existing host file", async () => {
    const dir = makeTempProject();
    await writeGeneratedHostsFiles(dir, "my-project");
    const file = join(dir, "hosts/connect/host.js");
    writeFileSync(file, "// user-owned edit\nexport default {};\n");

    await writeGeneratedHostsFiles(dir, "my-project");
    expect(readFileSync(file, "utf-8")).toContain("user-owned edit");
    // ...while still seeding files the project lacks:
    rmSync(join(dir, "hosts/vetra/host.js"));
    await writeGeneratedHostsFiles(dir, "my-project");
    expect(existsSync(join(dir, "hosts/vetra/host.js"))).toBe(true);
  });
});

/* --------------------------------------------- typed hosts: tsc -p hosts */

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

/** Workspace packages the scaffold's hosts (and types.d.ts) name, with a
 * dist file each must have built: tsc reads their published `types`. */
const LINKED_PACKAGES: [string, string, string][] = [
  ["@powerhousedao/host-core", "packages/host-core", "dist/schema.d.mts"],
  ["@powerhousedao/ph-cli", "clis/ph-cli", "dist/runners/switchboard.d.mts"],
  [
    "@powerhousedao/clint",
    "packages/clint",
    "dist/runners/mastra-runner.d.mts",
  ],
  ["@powerhousedao/desktop", "packages/desktop", "dist/runner.d.mts"],
  ["@powerhousedao/connect", "apps/connect", "dist/plugin-configs.d.ts"],
  [
    "@powerhousedao/switchboard",
    "apps/switchboard",
    "dist/plugins/workflows.d.mts",
  ],
  ["@powerhousedao/shared", "packages/shared", "package.json"],
];

/** A scaffolded project whose node_modules link the workspace packages (as
 * an installed project would resolve them), plus the root tsconfig. */
async function makeLinkedScaffold(): Promise<string> {
  const missing = LINKED_PACKAGES.filter(
    ([, dir, built]) => !existsSync(join(REPO, dir, built)),
  ).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `generated-hosts typing test needs built dists of: ${missing.join(", ")}. ` +
        `Build them first (pnpm --filter <pkg> build; connect: build:bundle).`,
    );
  }
  const dir = makeTempProject();
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: "my-project",
        type: "module",
        scripts: { tsc: "tsc" },
        devDependencies: Object.fromEntries(
          LINKED_PACKAGES.map(([name]) => [name, "workspace:*"]),
        ),
      },
      null,
      2,
    ),
  );
  writeFileSync(join(dir, "tsconfig.json"), tsConfigTemplate);
  writeFileSync(
    join(dir, "powerhouse.config.json"),
    await buildPowerhouseConfigTemplate({ name: "my-project" }),
  );
  for (const [name, pkgDir] of LINKED_PACKAGES) {
    const link = join(dir, "node_modules", name);
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(join(REPO, pkgDir), link, "junction");
  }
  await writeGeneratedHostsFiles(dir, "my-project");
  return dir;
}

const TSC = join(
  dirname(createRequire(import.meta.url).resolve("typescript/package.json")),
  "bin",
  "tsc",
);

/** `tsc -p hosts` in `dir`; diagnostics as `file(line,col): error TSxxxx`. */
function tscHosts(dir: string): { status: number | null; errors: string[] } {
  const run = spawnSync(
    process.execPath,
    [TSC, "-p", "hosts", "--pretty", "false"],
    {
      cwd: dir,
      encoding: "utf8",
    },
  );
  const errors = `${run.stdout}${run.stderr}`
    .split("\n")
    .filter((line) => /error TS\d+/.test(line));
  return { status: run.status, errors };
}

function writeFixture(dir: string, host: string, source: string): void {
  mkdirSync(join(dir, "hosts", host), { recursive: true });
  writeFileSync(join(dir, "hosts", host, "host.js"), source);
}

describe("typed hosts: ph generate hosts + tsc -p hosts", () => {
  it("scaffolds the tsc wiring, generates outputs.js, and tsc -p hosts rejects a typo, a wrong token path and a wrong plugin config", async () => {
    const dir = await makeLinkedScaffold();

    // scaffold wiring
    const pkg = JSON.parse(
      readFileSync(join(dir, "package.json"), "utf-8"),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts.tsc).toBe("tsc && tsc -p hosts");
    const tsconfig = readFileSync(join(dir, "hosts/tsconfig.json"), "utf-8");
    expect(tsconfig).toContain('"checkJs": true');
    expect(tsconfig).toContain('"exactOptionalPropertyTypes": true');
    const types = readFileSync(join(dir, "hosts/types.d.ts"), "utf-8");
    for (const specifier of [
      "@powerhousedao/ph-cli/runners/connect",
      "@powerhousedao/ph-cli/runners/switchboard",
      "@powerhousedao/clint/mastra-runner",
      "@powerhousedao/clint/clint-runner",
      "@powerhousedao/desktop/runner",
      "@powerhousedao/switchboard/plugins/workflows",
      "@powerhousedao/connect/plugin-configs",
    ]) {
      expect(types).toContain(`import type {} from "${specifier}";`);
    }

    // ph generate hosts
    const result = await generateHostsFiles(dir);
    expect(result.failed).toEqual([]);
    expect(result.written).toEqual(
      expect.arrayContaining([
        "hosts/switchboard/outputs.js",
        "hosts/switchboard/outputs.d.ts",
        "hosts/connect/outputs.js",
      ]),
    );
    const outputsJs = readFileSync(
      join(dir, "hosts/switchboard/outputs.js"),
      "utf-8",
    );
    // the plugin-contributed workflows drive is a known key
    expect(outputsJs).toContain("workflows:");
    expect(
      outputsJs.replace(/sha256:[0-9a-f]+/, "sha256:<hash>"),
    ).toMatchSnapshot("switchboard outputs.js");
    expect(
      readFileSync(
        join(dir, "hosts/switchboard/outputs.d.ts"),
        "utf-8",
      ).replace(/sha256:[0-9a-f]+/, "sha256:<hash>"),
    ).toMatchSnapshot("switchboard outputs.d.ts");

    // the scaffold as generated type-checks
    expect(tscHosts(dir)).toEqual({ status: 0, errors: [] });
    expect(
      readFileSync(join(dir, "powerhouse.config.d.json.ts"), "utf-8"),
    ).toContain("PowerhouseConfig");

    // every scaffold host carries `@satisfies {PHHost}`, so the clean tsc
    // run above type-checked each against its runner's declared schema
    for (const host of [
      "connect",
      "switchboard",
      "vetra",
      "desktop",
      "assistant",
      "cli",
    ]) {
      expect(
        readFileSync(join(dir, "hosts", host, "host.js"), "utf-8"),
      ).toMatch(/^\/\*\* @satisfies \{PHHost\} \*\/\nexport default \{/m);
    }

    // a typed host consuming the generated tokens checks clean...
    writeFixture(
      dir,
      "lab",
      `// @ts-check
import { outputs as switchboard } from "../switchboard/outputs.js";

/** @type {{ $output: { host: string; path: (string | number)[] } }} */
export const workflowsUrl = switchboard.drives.workflows.url;

/** @satisfies {PHHost} */
export default {
  name: "lab",
  runner: {
    module: "@powerhousedao/ph-cli/runners/switchboard",
    port: 4001,
    plugins: ["@powerhousedao/switchboard/plugins/workflows"],
  },
  reactor: { drives: [{ slug: "lab", name: "Lab" }] },
};
`,
    );
    // ...while a typo, a wrong token path and a wrong plugin config fail.
    // The wrong path fails as a property access on the generated tree
    // (outputs.d.ts), independent of how ref() fields type tokens.
    // ...and a connect host taking the workflows drive as that token: the
    // plugin's `drive` is ref(z.url()), so the token checks clean while the
    // drive entry itself (an object, not a token) fails.
    writeFixture(
      dir,
      "labconnect",
      `// @ts-check
import { outputs as switchboard } from "../switchboard/outputs.js";

/** @satisfies {PHHost} */
export default {
  name: "labconnect",
  runner: {
    module: "@powerhousedao/ph-cli/runners/connect",
    plugins: [
      {
        module: "@powerhousedao/connect/plugins/workflows",
        config: { drive: switchboard.drives.workflows.url },
      },
    ],
  },
};
`,
    );
    writeFixture(
      dir,
      "baddrive",
      `// @ts-check
import { outputs as switchboard } from "../switchboard/outputs.js";

/** @satisfies {PHHost} */
export default {
  name: "baddrive",
  runner: {
    module: "@powerhousedao/ph-cli/runners/connect",
    plugins: [
      {
        module: "@powerhousedao/connect/plugins/workflows",
        config: { drive: switchboard.drives.workflows },
      },
    ],
  },
};
`,
    );
    writeFixture(
      dir,
      "typo",
      `// @ts-check
/** @satisfies {PHHost} */
export default {
  name: "typo",
  runner: { module: "@powerhousedao/ph-cli/runners/switchboard" },
  reactor: { drive: [{ slug: "lab", name: "Lab" }] },
};
`,
    );
    writeFixture(
      dir,
      "badpath",
      `// @ts-check
import { outputs as switchboard } from "../switchboard/outputs.js";

export const url = switchboard.drives.workflow.url;
export default { name: "badpath", runner: { module: "x" } };
`,
    );
    writeFixture(
      dir,
      "badplugin",
      `// @ts-check
/** @satisfies {PHHost} */
export default {
  name: "badplugin",
  runner: {
    module: "@powerhousedao/ph-cli/runners/connect",
    plugins: [
      { module: "@powerhousedao/connect/plugins/generic", config: { allowAddDrives: true } },
    ],
  },
};
`,
    );
    // $map (T4): the cli shape — every drive the switchboard serves, by a
    // $map over its `drives` output — checks clean, while a branded $item
    // in a non-string slot fails. mapbad is also the CROSS-COPY regression
    // test: its $item comes from outputs.d.ts (host-core/schema) and its
    // target type from the ph-cli runner dist, which inlines its own copy of
    // host-core's token types; the brands must still agree.
    writeFixture(
      dir,
      "mapcli",
      `// @ts-check
import connect from "../connect/host.js";
import { outputs as switchboard } from "../switchboard/outputs.js";

/** @satisfies {PHHost} */
export default {
  name: "mapcli",
  runner: { module: "@powerhousedao/host-core/runners/compound" },
  children: {
    "cli-switchboard": { host: "switchboard" },
    "cli-connect": {
      host: "connect",
      reactor: {
        protocol: connect.reactor.protocol,
        backends: {
          sb: { kind: "remote", remote: { url: switchboard.endpoints.graphql } },
        },
        drives: {
          $map: {
            over: { $output: { host: "switchboard", path: ["drives"] } },
            to: { slug: { $key: true }, remote: { url: switchboard.drives.$item.url } },
          },
        },
      },
    },
  },
};
`,
    );
    writeFixture(
      dir,
      "mapbad",
      `// @ts-check
import { outputs as switchboard } from "../switchboard/outputs.js";

/** @satisfies {PHHost} */
export default {
  name: "mapbad",
  runner: { module: "@powerhousedao/ph-cli/runners/connect" },
  reactor: {
    drives: {
      $map: {
        over: { $output: { host: "switchboard", path: ["drives"] } },
        to: { slug: { $key: true }, availableOffline: switchboard.drives.$item.url },
      },
    },
  },
};
`,
    );
    const { status, errors } = tscHosts(dir);
    expect(status).not.toBe(0);
    const byFile = (host: string) =>
      errors.filter((line) => line.startsWith(`hosts/${host}/host.js`));
    expect(byFile("lab")).toEqual([]);
    expect(byFile("labconnect")).toEqual([]);
    expect(byFile("baddrive").join("\n")).toMatch(
      // the target union lists the tokens that fit a string field
      /error TS2322: Type '\{ id: OutputToken<string>; url: OutputToken<string>; \}' is not assignable to type 'string \| [^']*OutputToken<string>[^']*'/,
    );
    expect(byFile("mapcli")).toEqual([]);
    expect(byFile("mapbad").join("\n")).toMatch(
      /error TS2322: [^\n]*availableOffline: ItemToken<string>/,
    );
    expect(byFile("typo").join("\n")).toMatch(/'drive' does not exist/);
    expect(byFile("badpath").join("\n")).toMatch(
      /Property 'workflow' does not exist/,
    );
    expect(byFile("badplugin").join("\n")).toMatch(/allowAddDrives/);
    expect(
      errors.filter(
        (line) =>
          !/^hosts\/(typo|badpath|badplugin|baddrive|mapbad)\//.test(line),
      ),
    ).toEqual([]);
  }, 240_000);
});

describe("generateHostsFiles error handling", () => {
  it("reports a host failing the lint and keeps going", async () => {
    const dir = makeTempProject();
    writeFileSync(join(dir, "package.json"), "{}");
    writeFixture(
      dir,
      "bad",
      `export default { name: "bad", runner: { module: "x" }, v: process.env.X };`,
    );
    writeFixture(
      dir,
      "other",
      `export default { name: "other", runner: { module: "not-installed" } };`,
    );
    const result = await generateHostsFiles(dir);
    expect(result.failed.map((f) => f.host)).toEqual(["bad"]);
    expect(result.failed[0]?.error).toMatch(/reads `process\.`/);
    expect(result.skipped.map((s) => s.host)).toEqual(["other"]);
    expect(result.skipped[0]?.reason).toMatch(/Cannot resolve/);
    expect(result.written).toContain("hosts/types.d.ts");
  });
});
