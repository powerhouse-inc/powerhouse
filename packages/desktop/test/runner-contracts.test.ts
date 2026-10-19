import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emitHostJsonSchema, validateHost } from "@powerhousedao/host-core";
import type { PHHost, PHHostOutputs } from "@powerhousedao/host-core";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import * as desktopRunner from "../src/runner.js";
import type { ShellOptions } from "../src/shell.js";

const DESKTOP = "@powerhousedao/desktop/runner";
/** The runner module as validateHost sees it (spread: the index-signature
 * shape of RunnerModule, no cast). */
const desktop = { ...desktopRunner };

/** The scaffold/Sektar desktop host, with a mode-2 shell block. The
 * `satisfies PHHost` is the type-level half of the contract. */
const desktopHost = () =>
  ({
    name: "desktop",
    runner: {
      module: DESKTOP,
      shell: {
        project: "../ph-win-desktop",
        window: { title: "Lab", width: 1440, height: 900 },
        tray: true,
        fileAssociations: [".phd"],
      },
      vendorStack: false,
      phCliVersion: "dev",
    },
    profile: { appId: "inc.powerhouse.desktop.lab", name: "Lab" },
    config: {
      startOrder: ["desktop-switchboard", "desktop-connect"],
      cspRegistrySync: true,
      runtimeRecord: true,
    },
    children: {
      "desktop-switchboard": {
        host: "switchboard",
        reactor: {
          backends: {
            main: {
              kind: "in-process",
              storage: {
                kind: "path",
                dataDir: "${userData}/.ph/reactor-storage",
              },
              packages: { dynamic: true },
            },
          },
        },
      },
      "desktop-connect": {
        host: "connect",
        runner: { defaultVerb: "serve", port: 3000 },
      },
    },
  }) satisfies PHHost;

const validate = (host: unknown) =>
  validateHost(desktop, DESKTOP, host, "hosts/desktop/host.js");

describe("desktop runner host contract", () => {
  it("accepts the scaffold desktop host with shell options", () => {
    const parsed = validate(desktopHost());
    expect(parsed.runner.shell?.window?.width).toBe(1440);
    expect(parsed.config?.cspRegistrySync).toBe(true);
  });

  it("rejects an unknown runner key", () => {
    const host = desktopHost();
    expect(() =>
      validate({ ...host, runner: { ...host.runner, vendorStak: true } }),
    ).toThrow(/runner: Unrecognized key: "vendorStak"/);
    expect(() =>
      validate({
        ...host,
        runner: { ...host.runner, shell: { projct: "../s" } },
      }),
    ).toThrow(/runner\.shell: Unrecognized key: "projct"/);
  });

  it("rejects a defaultVerb typo", () => {
    const host = desktopHost();
    expect(() =>
      validate({ ...host, runner: { ...host.runner, defaultVerb: "devv" } }),
    ).toThrow(/defaultVerb "devv" is not a verb/);
  });

  it("applies the startOrder refinement", () => {
    const host = desktopHost();
    expect(() =>
      validate({
        ...host,
        config: { ...host.config, startOrder: ["desktop-switchbaord"] },
      }),
    ).toThrow(/config\.startOrder\.0: startOrder names "desktop-switchbaord"/);
  });

  it("takes the generic compound's strict wiring as config", () => {
    const host = desktopHost();
    expect(() =>
      validate({ ...host, config: { ...host.config, runtimeRecords: true } }),
    ).toThrow(/config: Unrecognized key: "runtimeRecords"/);
  });

  it("produces no outputs of its own", () => {
    expect(desktopRunner.outputsSchema.parse({})).toEqual({});
    expect(desktopRunner.outputsSchema.safeParse({ port: 1 }).success).toBe(
      false,
    );
  });
});

describe("types", () => {
  it("shellOptionsSchema and ShellOptions stay in step", () => {
    type Declared = z.output<typeof desktopRunner.shellOptionsSchema>;
    expectTypeOf<Declared>().toEqualTypeOf<ShellOptions>();
  });

  it("PHHostRunners types desktop host files by runner.module", () => {
    const typo = {
      name: "desktop",
      // @ts-expect-error -- `vendorStak` is not a desktop runner option
      runner: { module: DESKTOP, vendorStak: true },
      children: {},
    } satisfies PHHost;
    expect(typo.name).toBe("desktop");

    expectTypeOf<
      PHHostOutputs<typeof DESKTOP>
    >().toEqualTypeOf<desktopRunner.DesktopOutputs>();
  });
});

const schemasDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "schemas",
);

/** Committed artifacts must match the live schema. Fix a failure with:
 * pnpm --filter @powerhousedao/desktop emit-schemas */
describe("emitted runner host schema drift", () => {
  it("schemas/host-desktop-runner.schema.json is current", () => {
    const committed = JSON.parse(
      readFileSync(
        path.join(schemasDir, "host-desktop-runner.schema.json"),
        "utf8",
      ),
    ) as unknown;
    expect(committed).toEqual(
      emitHostJsonSchema("host-desktop-runner", desktopRunner.hostSchema),
    );
  });
});
