import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Agent } from "package-manager-detector";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installedStudio,
  openVetraStudio,
  planVetraGateway,
  studioInstallCommand,
  VETRA_GATEWAY_ENV,
  VETRA_STUDIO_HOST,
  type InstalledStudio,
  type VetraGatewayDeps,
} from "../src/services/vetra-gateway.js";

const VERSION = "6.4.0";
const PROJECT = path.join(tmpdir(), "a-project");

/** The gateway's world, every part a stub: no network, no real project. */
function deps(overrides: Partial<VetraGatewayDeps> = {}) {
  const log = vi.fn<(message: string) => void>();
  const warn = vi.fn<(message: string) => void>();
  const install = vi.fn<VetraGatewayDeps["install"]>(() => Promise.resolve(0));
  const reexec = vi.fn<VetraGatewayDeps["reexec"]>(() => Promise.resolve(0));
  const all: VetraGatewayDeps = {
    project: () =>
      Promise.resolve({ projectPath: PROJECT, packageManager: "pnpm" }),
    phCliVersion: VERSION,
    installedStudio: () => ({ version: VERSION }),
    install,
    reexec,
    env: {},
    log,
    warn,
    ...overrides,
  };
  return { all, log, warn, install, reexec };
}

/** Not installed until the install has run. */
function installedAfterInstall(): Pick<
  VetraGatewayDeps,
  "installedStudio" | "install"
> {
  let installed: InstalledStudio;
  return {
    installedStudio: () => installed,
    install: vi.fn(() => {
      installed = { version: VERSION };
      return Promise.resolve(0);
    }),
  };
}

describe("studioInstallCommand", () => {
  it.each<[Agent, string]>([
    [
      "pnpm",
      `pnpm add -D @powerhousedao/vetra-cli@${VERSION} --config.minimum-release-age=0`,
    ],
    ["npm", `npm i -D @powerhousedao/vetra-cli@${VERSION}`],
    ["yarn", `yarn add -D @powerhousedao/vetra-cli@${VERSION}`],
    ["yarn@berry", `yarn add -D @powerhousedao/vetra-cli@${VERSION}`],
    ["bun", `bun add -D @powerhousedao/vetra-cli@${VERSION}`],
  ])("adds it at ph-cli's version as a devDependency with %s", (pm, line) => {
    expect(studioInstallCommand(pm, VERSION)).toBe(line);
  });

  it("pins a prerelease exactly", () => {
    expect(studioInstallCommand("npm", "6.4.0-next.3")).toBe(
      "npm i -D @powerhousedao/vetra-cli@6.4.0-next.3",
    );
  });

  it("takes the latest release when ph-cli does not know its version", () => {
    expect(studioInstallCommand("npm", "unknown")).toBe(
      "npm i -D @powerhousedao/vetra-cli@latest",
    );
  });
});

describe("planVetraGateway", () => {
  it("installs a package the project lacks", () => {
    expect(
      planVetraGateway({
        installed: undefined,
        phCliVersion: VERSION,
        packageManager: "npm",
      }),
    ).toEqual({
      action: "install",
      notice:
        "Vetra Studio is the package @powerhousedao/vetra-cli, which this project does not have yet. " +
        "Installing it as a devDependency with npm:",
      command: `npm i -D @powerhousedao/vetra-cli@${VERSION}`,
    });
  });

  it("runs ph-cli's own version without a word", () => {
    expect(
      planVetraGateway({
        installed: { version: VERSION },
        phCliVersion: VERSION,
        packageManager: "pnpm",
      }),
    ).toEqual({ action: "run" });
  });

  it("runs another version, warning with both and the command that aligns them", () => {
    expect(
      planVetraGateway({
        installed: { version: "6.3.2" },
        phCliVersion: VERSION,
        packageManager: "yarn",
      }),
    ).toEqual({
      action: "run",
      warning: `@powerhousedao/vetra-cli 6.3.2 is installed, but this ph-cli is ${VERSION}: align them with \`yarn add -D @powerhousedao/vetra-cli@${VERSION}\`.`,
    });
  });

  it("does not compare a version it does not know", () => {
    for (const [installed, phCliVersion] of [
      [{ version: undefined }, VERSION],
      [{ version: "6.3.2" }, "unknown"],
    ] as const) {
      expect(
        planVetraGateway({ installed, phCliVersion, packageManager: "npm" }),
      ).toEqual({ action: "run" });
    }
  });
});

describe("openVetraStudio", () => {
  it("runs the studio host with the verb and arguments when it is installed", async () => {
    const { all, install, reexec, log, warn } = deps();
    await expect(
      openVetraStudio(["dev", "--port", "4001"], all),
    ).resolves.toEqual({
      args: ["run", VETRA_STUDIO_HOST, "dev", "--port", "4001"],
      projectRoot: PROJECT,
    });
    expect(install).not.toHaveBeenCalled();
    expect(reexec).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns once about another installed version, and runs it as it is", async () => {
    const { all, install, warn } = deps({
      installedStudio: () => ({ version: "6.3.2" }),
    });
    await expect(openVetraStudio([], all)).resolves.toEqual({
      args: ["run", VETRA_STUDIO_HOST],
      projectRoot: PROJECT,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("6.3.2");
    expect(warn.mock.calls[0][0]).toContain(VERSION);
    expect(install).not.toHaveBeenCalled();
  });

  it("installs a missing package, says so, and runs the host in a new ph-cli", async () => {
    const world = installedAfterInstall();
    const { all, log, reexec } = deps({ ...world });
    reexec.mockResolvedValue(3);
    await expect(openVetraStudio(["serve"], all)).resolves.toEqual({
      exitCode: 3,
    });
    const command = `pnpm add -D @powerhousedao/vetra-cli@${VERSION} --config.minimum-release-age=0`;
    expect(world.install).toHaveBeenCalledWith(command, PROJECT);
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      "Vetra Studio is the package @powerhousedao/vetra-cli, which this project does not have yet. " +
        "Installing it as a devDependency with pnpm:",
      `> ${command}`,
    ]);
    expect(reexec).toHaveBeenCalledWith(
      ["run", VETRA_STUDIO_HOST, "serve"],
      PROJECT,
    );
  });

  it("ends a failed install with the command to run, and runs nothing", async () => {
    const { all, reexec } = deps({
      installedStudio: () => undefined,
      install: () => Promise.resolve(1),
      project: () =>
        Promise.resolve({ projectPath: PROJECT, packageManager: "npm" }),
    });
    const command = `npm i -D @powerhousedao/vetra-cli@${VERSION}`;
    await expect(openVetraStudio([], all)).rejects.toThrow(
      new Error(
        "The install of @powerhousedao/vetra-cli exited with code 1, so Vetra Studio cannot start. " +
          `Install it yourself, then run \`ph vetra\` again:\n  ${command}`,
      ),
    );
    expect(reexec).not.toHaveBeenCalled();
  });

  it("says so when the package manager cannot run at all", async () => {
    const { all } = deps({
      installedStudio: () => undefined,
      install: () => Promise.resolve(null),
    });
    await expect(openVetraStudio([], all)).rejects.toThrow(
      /^The install of @powerhousedao\/vetra-cli could not run, so Vetra Studio cannot start\./,
    );
  });

  it("refuses when the package is still missing after a passed install", async () => {
    const { all, reexec } = deps({ installedStudio: () => undefined });
    await expect(openVetraStudio([], all)).rejects.toThrow(
      /^The install passed, but @powerhousedao\/vetra-cli does not resolve from /,
    );
    expect(reexec).not.toHaveBeenCalled();
  });

  it("never installs again in the ph-cli an install started", async () => {
    const { all, install } = deps({
      installedStudio: () => undefined,
      env: { [VETRA_GATEWAY_ENV]: "1" },
    });
    await expect(openVetraStudio([], all)).rejects.toThrow(
      /^@powerhousedao\/vetra-cli was installed, but this ph-cli does not find it/,
    );
    expect(install).not.toHaveBeenCalled();
  });

  it("stops a running Studio without installing anything", async () => {
    const { all, install } = deps({ installedStudio: () => undefined });
    await expect(openVetraStudio(["--stop"], all)).resolves.toEqual({
      args: ["run", VETRA_STUDIO_HOST, "--stop"],
      projectRoot: PROJECT,
    });
    expect(install).not.toHaveBeenCalled();
  });

  it("refuses outside a project", async () => {
    const { all, install } = deps({
      project: () =>
        Promise.resolve({ projectPath: undefined, packageManager: "npm" }),
    });
    await expect(openVetraStudio([], all)).rejects.toThrow(
      /^No Powerhouse project found, so `ph vetra` cannot open Vetra Studio/,
    );
    expect(install).not.toHaveBeenCalled();
  });
});

describe("installedStudio", () => {
  const temporary: string[] = [];
  afterEach(() => {
    for (const dir of temporary.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function project(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "ph-vetra-gateway-"));
    temporary.push(dir);
    writeFileSync(path.join(dir, "package.json"), '{"name":"a-project"}');
    return dir;
  }

  it("is undefined in a project without the package", () => {
    expect(installedStudio(project())).toBeUndefined();
  });

  it("reads the version from the package's package.json, importing nothing", () => {
    const dir = project();
    const pkg = path.join(dir, "node_modules", "@powerhousedao", "vetra-cli");
    mkdirSync(pkg, { recursive: true });
    // An entry that throws if anything imports it.
    writeFileSync(
      path.join(pkg, "package.json"),
      JSON.stringify({
        name: "@powerhousedao/vetra-cli",
        version: "6.4.0-next.1",
        exports: { ".": "./index.js" },
      }),
    );
    writeFileSync(path.join(pkg, "index.js"), "throw new Error('imported');");
    expect(installedStudio(dir)).toEqual({ version: "6.4.0-next.1" });
  });
});
