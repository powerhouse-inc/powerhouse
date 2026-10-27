import type {
  PHConnectDefaultDrive,
  PHConnectRuntimeConfig,
} from "@powerhousedao/shared/clis";
import { buildPowerhouseConfigTemplate } from "@powerhousedao/codegen/templates";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildVetraStudioOverride } from "../src/services/vetra.js";
import type { ConnectStudioArgs } from "../src/types.js";
import { buildStudioConnectOverride } from "../src/utils/cli-connect-override.js";

const vetraDrive: PHConnectDefaultDrive = {
  url: "http://localhost:4001/d/vetra-9e05d8b8",
  name: null,
  icon: null,
};
const previewDrive: PHConnectDefaultDrive = {
  url: "http://localhost:4001/d/preview-9e05d8b8",
  name: null,
  icon: null,
};

const args = {
  connectBasePath: "/",
  logLevel: "info",
  defaultDrivesUrl: "",
  drivesPreserveStrategy: "preserve-by-url-and-detach",
  renownNamespace: undefined,
} as ConnectStudioArgs;

/** What `ph vetra` hands Studio's Connect, after the studio layers. */
function studioConfig(
  options: Parameters<typeof buildVetraStudioOverride>[1],
): PHConnectRuntimeConfig | undefined {
  return buildStudioConnectOverride(
    args,
    buildVetraStudioOverride([vetraDrive, previewDrive], options),
  );
}

describe("the Connect config ph vetra gives Studio", () => {
  let originalArgv: string[];
  beforeEach(() => {
    originalArgv = process.argv;
    process.argv = ["node", "cli"];
  });
  afterEach(() => {
    process.argv = originalArgv;
  });

  it("reads and writes on the local Switchboard, keeping the Vetra and preview drives", () => {
    expect(studioConfig({})).toEqual({
      app: { studioMode: true, cookieBanner: false },
      drives: {
        defaultDrives: [vetraDrive, previewDrive],
        preserveStrategy: "preserve-all",
      },
      instance: { reactorClient: "remote" },
    });
  });

  it("keeps a local reactor with a remote Vetra drive", () => {
    expect(
      studioConfig({ remoteDrive: "https://vetra.example.com/d/abc" })
        ?.instance,
    ).toBeUndefined();
  });

  it("leaves the choice to a project that makes it", () => {
    const off = { instance: { multiReactor: false } } as PHConnectRuntimeConfig;
    const remote = {
      instance: { reactorClient: "remote" },
    } as PHConnectRuntimeConfig;

    expect(studioConfig({ projectConnect: off })?.instance).toBeUndefined();
    expect(studioConfig({ projectConnect: remote })?.instance).toBeUndefined();
  });

  it("shows no cookie banner, unless the project asks for one", () => {
    const banner = { app: { cookieBanner: true } } as PHConnectRuntimeConfig;

    expect(studioConfig({})?.app?.cookieBanner).toBe(false);
    expect(
      studioConfig({ projectConnect: banner })?.app?.cookieBanner,
    ).toBeUndefined();
  });

  it("shows no cookie banner in a project ph init scaffolded", async () => {
    const scaffolded = JSON.parse(
      await buildPowerhouseConfigTemplate({ name: "fresh-project" }),
    ) as { connect: PHConnectRuntimeConfig };

    expect(
      studioConfig({ projectConnect: scaffolded.connect })?.app?.cookieBanner,
    ).toBe(false);
  });
});
