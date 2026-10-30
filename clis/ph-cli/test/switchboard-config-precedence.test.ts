import type { SwitchboardConfigInput } from "@powerhousedao/switchboard/config";
import { describe, expect, it } from "vitest";
import { memberSwitchboardConfig } from "../src/runners/member-config.js";
import { classicSwitchboardArgs } from "../src/services/classic-args.js";
import { switchboardConfigOf } from "../src/services/switchboard.js";

// Precedence: an explicit flag, then the member's config.switchboard, then defaults.

const memberConfig = (switchboard: SwitchboardConfigInput) =>
  memberSwitchboardConfig(
    { config: { switchboard } },
    { shell: {}, dotenv: {} },
    { pluginHost: false },
  );

async function configFor(argv: string[], switchboard: SwitchboardConfigInput) {
  const args = await classicSwitchboardArgs(argv);
  return switchboardConfigOf(args, undefined, await memberConfig(switchboard))
    .config;
}

describe("switchboard config precedence", () => {
  it("keeps a member's disableLocal when --ignore-local is not passed", async () => {
    expect(
      (await configFor([], { packages: { disableLocal: true } })).packages,
    ).toMatchObject({ disableLocal: true });
    expect(
      (await configFor([], { packages: { list: ["/src"] } })).packages
        ?.disableLocal,
    ).toBeUndefined();
  });

  it("lets an explicit --ignore-local win over the member's config", async () => {
    expect(
      (
        await configFor(["--ignore-local=false"], {
          packages: { disableLocal: true },
        })
      ).packages,
    ).toMatchObject({ disableLocal: false });
    expect(
      (
        await configFor(["--ignore-local"], {
          packages: { disableLocal: false },
        })
      ).packages,
    ).toMatchObject({ disableLocal: true });
  });

  it("puts a defaulted https under the member's own server.https", async () => {
    const withDefault = (switchboard: SwitchboardConfigInput) =>
      memberSwitchboardConfig(
        { config: { switchboard } },
        { shell: {}, dotenv: {} },
        { pluginHost: false, defaults: { server: { https: false } } },
      );
    const args = { ...(await classicSwitchboardArgs([])), https: undefined };
    const own = switchboardConfigOf(
      args,
      undefined,
      await withDefault({ server: { https: true } }),
    ).config;
    expect(own.server?.https).toBe(true);
    const fallback = switchboardConfigOf(
      args,
      undefined,
      await withDefault({}),
    ).config;
    expect(fallback.server?.https).toBe(false);
  });
});
