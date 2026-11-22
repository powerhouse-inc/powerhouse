import {
  CLINT_PACKAGE,
  packageJsonExports,
  packageScripts,
} from "@powerhousedao/shared/clis/constants";
import type { PackageJson } from "read-pkg";
import { packageJsonTemplate } from "templates";
import { describe, expect, it } from "vitest";
import {
  migratedPackageJson,
  migratedScripts,
  resolveManagedDependencies,
} from "./migrate.js";

// A project generated before `ph build` stopped building subgraphs for the
// browser, with the exports its package.json was given then.
const generatedBefore = {
  name: "legacy-project",
  version: "1.2.3",
  exports: {
    ".": {
      types: "./dist/types/index.d.ts",
      browser: "./dist/browser/index.js",
      node: "./dist/node/index.mjs",
    },
    "./subgraphs": {
      types: "./dist/types/subgraphs/index.d.ts",
      browser: "./dist/browser/subgraphs/index.js",
      node: "./dist/node/subgraphs/index.mjs",
    },
    "./tools": "./dist/tools.js",
  },
  scripts: { custom: "echo custom", tsc: "tsc && tsc -p hosts" },
  dependencies: { leftover: "1.0.0" },
} as unknown as PackageJson;

describe("migratedPackageJson", () => {
  const migrated = migratedPackageJson(generatedBefore, {
    peerDependencies: { "document-model": "1.0.0" },
    devDependencies: { "@powerhousedao/ph-cli": "1.0.0" },
  });

  it("updates the exports it manages and keeps the project's own", () => {
    expect(migrated.exports).toEqual({
      "./tools": "./dist/tools.js",
      ...packageJsonExports,
    });
    // The browser build of ./subgraphs, which ph build no longer emits, goes.
    expect(
      (migrated.exports as Record<string, Record<string, string>>)[
        "./subgraphs"
      ],
    ).toEqual({
      types: "./dist/types/subgraphs/index.d.ts",
      node: "./dist/node/subgraphs/index.mjs",
    });
  });

  it("keeps the project's own fields, scripts and runtime dependencies", () => {
    expect(migrated).toMatchObject({
      name: "legacy-project",
      version: "1.2.3",
      type: "module",
      peerDependencies: { "document-model": "1.0.0" },
      devDependencies: { "@powerhousedao/ph-cli": "1.0.0" },
    });
    expect(migrated.scripts).toHaveProperty("custom", "echo custom");
    expect(migrated.dependencies).toEqual({ leftover: "1.0.0" });
  });
});

describe("the scripts migrate manages", () => {
  it("adds a missing one and updates one an earlier scaffold wrote", () => {
    const { scripts, kept } = migratedScripts({
      lint: "eslint --config eslint.config.js --cache",
      build: "npm run tsc && npm run tailwind",
    });
    expect(scripts.lint).toBe(packageScripts.lint);
    expect(scripts.build).toBe(packageScripts.build);
    expect(scripts.vetra).toBe(packageScripts.vetra);
    expect(kept).toEqual([]);
  });

  it("moves the classic commands an earlier scaffold wrote to the hosts", () => {
    const { scripts, kept } = migratedScripts({
      connect: "ph-cli connect",
      vetra: "ph-cli vetra",
      reactor: "ph-cli reactor",
    });
    expect(scripts.connect).toBe("ph-cli run connect");
    expect(scripts.vetra).toBe("ph-cli run vetra");
    // No longer a script of the scaffold, but still the value it wrote.
    expect(scripts.reactor).toBe("ph-cli run switchboard");
    expect(kept).toEqual([]);
  });

  it("leaves the classic commands when the project has no such host", () => {
    const own = { connect: "ph-cli connect" };
    const { scripts, kept } = migratedScripts(own, (name) => name !== "vetra");
    expect(scripts.connect).toBe("ph-cli run connect");
    // No vetra host: none is added.
    expect(scripts).not.toHaveProperty("vetra");
    expect(
      migratedScripts({ vetra: "ph-cli vetra" }, () => false).scripts.vetra,
    ).toBe("ph-cli vetra");
    expect(kept).toEqual([]);
  });

  it("keeps a value the project wrote and names the script", () => {
    const own = {
      lint: "oxlint --deny-warnings",
      build: "ph-cli build && node scripts/after-build.mjs",
      deploy: "node scripts/deploy.mjs",
    };
    const { scripts, kept } = migratedScripts(own);
    expect(scripts).toMatchObject(own);
    expect(kept).toEqual(["lint", "build"]);
  });

  it("gives the same scripts on a second run", () => {
    const first = migratedScripts({
      tsc: "tsc && tsc -p hosts",
      lint: "oxlint --deny-warnings",
    }).scripts;
    expect(migratedScripts(first).scripts).toEqual(first);
  });
});

describe("the dependencies of a migrated project", () => {
  const managed = resolveManagedDependencies({
    packageJson: {
      dependencies: {
        luxon: "^3.0.0",
        "@powerhousedao/reactor-browser": "6.0.0",
        eslint: "^9.0.0",
      },
      devDependencies: { "left-pad": "1.3.0" },
      peerDependencies: { "some-peer": "^1.0.0" },
    },
    features: [],
    fullyQualifiedVersion: "6.3.0-dev.1",
    workspacePackageNames: [],
  });

  it("keeps what the project added in the field it added it to", () => {
    expect(managed.dependencies).toEqual({ luxon: "^3.0.0" });
    expect(managed.devDependencies).toHaveProperty("left-pad", "1.3.0");
    expect(managed.devDependencies).not.toHaveProperty("luxon");
    expect(managed.peerDependencies).toHaveProperty("some-peer", "^1.0.0");
  });

  it("moves a managed package out of dependencies to its peer and dev pin", () => {
    expect(managed.peerDependencies).toHaveProperty(
      "@powerhousedao/reactor-browser",
      "6.3.0-dev.1",
    );
    expect(managed.devDependencies).toHaveProperty(
      "@powerhousedao/reactor-browser",
      "6.3.0-dev.1",
    );
    expect(managed.devDependencies).not.toHaveProperty("eslint");
  });

  it("gives the same sets on a second run", () => {
    const again = resolveManagedDependencies({
      packageJson: managed as PackageJson,
      features: [],
      fullyQualifiedVersion: "6.3.0-dev.1",
      workspacePackageNames: [],
    });
    expect(again).toEqual(managed);
  });
});

describe("the dependencies of a migrated project with a Cli", () => {
  const NEXT = "6.3.0-dev.1";
  const migrateCli = (packageJson: PackageJson) =>
    resolveManagedDependencies({
      packageJson,
      features: ["cli"],
      fullyQualifiedVersion: NEXT,
      workspacePackageNames: [],
    });

  it("adds clint as a peer at the migrated version, beside its dev pin", () => {
    const { peerDependencies, devDependencies } = migrateCli({
      peerDependencies: { "document-model": "6.0.0" },
      devDependencies: { [CLINT_PACKAGE]: "6.0.0" },
    });
    expect(peerDependencies).toHaveProperty(CLINT_PACKAGE, NEXT);
    expect(devDependencies).toHaveProperty(CLINT_PACKAGE, NEXT);
  });

  it("moves clint out of dependencies to its peer and dev pin", () => {
    const managed = migrateCli({
      dependencies: { [CLINT_PACKAGE]: "6.0.0", luxon: "^3.0.0" },
    });
    expect(managed.dependencies).toEqual({ luxon: "^3.0.0" });
    expect(managed.peerDependencies).toHaveProperty(CLINT_PACKAGE, NEXT);
    expect(managed.devDependencies).toHaveProperty(CLINT_PACKAGE, NEXT);
  });

  it("keeps a catalog: ref", () => {
    const { peerDependencies, devDependencies } = migrateCli({
      peerDependencies: { [CLINT_PACKAGE]: "catalog:" },
      devDependencies: { [CLINT_PACKAGE]: "catalog:" },
    });
    expect(peerDependencies).toHaveProperty(CLINT_PACKAGE, "catalog:");
    expect(devDependencies).toHaveProperty(CLINT_PACKAGE, "catalog:");
  });
});

describe("a project's dependency pins", () => {
  const pins = {
    "date-fns": "4.3.0",
    rolldown: "1.0.2",
    vite: "8.0.14",
    "@solana/kit": "5.5.1",
    "@solana-program/system": "0.10.0",
    "@solana-program/token": "0.9.0",
  };
  const refs = {
    "date-fns": "$date-fns",
    rolldown: "$rolldown",
    vite: "$vite",
    "@solana/kit": "5.5.1",
    "@solana-program/system": "0.10.0",
    "@solana-program/token": "0.9.0",
  };

  it("replaces the **/ resolutions earlier scaffolds wrote and keeps the project's own", () => {
    const migrated = migratedPackageJson(
      {
        ...generatedBefore,
        resolutions: {
          "**/date-fns": "4.3.0",
          "**/rolldown": "1.0.2",
          "**/vite": "8.0.14",
          "left-pad": "1.3.0",
        },
        overrides: { "left-pad": "1.3.0" },
      } as unknown as PackageJson,
      {},
    );
    expect(migrated.resolutions).toEqual({ "left-pad": "1.3.0", ...pins });
    expect(migrated.overrides).toEqual({ "left-pad": "1.3.0", ...refs });
  });

  it("adds them to a project that has none", () => {
    const migrated = migratedPackageJson(generatedBefore, {});
    expect(migrated.resolutions).toEqual(pins);
    expect(migrated.overrides).toEqual(refs);
  });
});

describe("the lint scripts", () => {
  it("generate the Connect route tree before the type-checked lint, in new and migrated projects", () => {
    const migrated = migratedPackageJson(generatedBefore, {});
    const scaffolded = JSON.parse(
      packageJsonTemplate("new-project", {}, {}),
    ) as {
      scripts: Record<string, string>;
    };

    for (const script of ["lint", "lint:fix"] as const) {
      expect(migrated.scripts?.[script]).toMatch(
        /^ph-cli generate connect-routes && oxlint --type-aware --type-check/,
      );
      expect(scaffolded.scripts[script]).toBe(packageScripts[script]);
    }
  });
});

describe("the scripts of a new project", () => {
  const scaffolded = JSON.parse(packageJsonTemplate("new-project", {}, {})) as {
    scripts: Record<string, string>;
  };

  it("are the ones migrate writes", () => {
    expect(scaffolded.scripts).toMatchObject(packageScripts);
    // Migrating a new project changes none of them.
    expect(migratedScripts(scaffolded.scripts)).toEqual({
      scripts: scaffolded.scripts,
      kept: [],
    });
  });

  it("run the project's hosts, with no classic command", () => {
    expect(scaffolded.scripts.connect).toBe("ph-cli run connect");
    expect(scaffolded.scripts.vetra).toBe("ph-cli run vetra");
    for (const name of [
      "reactor",
      "service",
      "service-startup",
      "service-unstartup",
    ]) {
      expect(scaffolded.scripts).not.toHaveProperty(name);
    }
  });
});

describe("scripts under retired names", () => {
  const startup =
    "bash ./node_modules/@powerhousedao/ph-cli/dist/scripts/service-startup.sh";

  it("moves reactor to the switchboard host and drops the service scripts", () => {
    const { scripts } = migratedScripts({
      reactor: "ph-cli reactor",
      "service-startup": startup,
      service: "ph-cli service",
    });
    expect(scripts.reactor).toBe("ph-cli run switchboard");
    expect(scripts).not.toHaveProperty("service-startup");
    expect(scripts).not.toHaveProperty("service");
    expect(migratedScripts(scripts).scripts).toEqual(scripts);
  });

  it("keeps reactor without a switchboard host, and any value the project set", () => {
    expect(
      migratedScripts({ reactor: "ph-cli reactor" }, () => false).scripts
        .reactor,
    ).toBe("ph-cli reactor");
    const own = {
      reactor: "ph-cli reactor --port 5000",
      service: "pm2 start ecosystem.config.js",
      "service-startup": "bash ./startup.sh",
    };
    expect(migratedScripts(own).scripts).toMatchObject(own);
  });
});

describe("the tsc script", () => {
  it("generates the Connect route tree before tsc, in new and migrated projects", () => {
    const migrated = migratedPackageJson(generatedBefore, {});
    const scaffolded = JSON.parse(
      packageJsonTemplate("new-project", {}, {}),
    ) as {
      scripts: Record<string, string>;
    };

    // The `tsc -p hosts` the hosts scaffold appended stays.
    expect(migrated.scripts?.tsc).toBe(`${packageScripts.tsc} && tsc -p hosts`);
    expect(scaffolded.scripts.tsc).toBe(packageScripts.tsc);
  });
});
