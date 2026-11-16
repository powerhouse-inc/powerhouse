import { MIGRATION_GUIDE_URL } from "@powerhousedao/shared/clis/deprecations";
import { describe, expect, it } from "vitest";
import { connectChromeDeprecation } from "../src/runners/host-deprecations.js";

const CONNECT = "hosts/connect/host.js";

describe("host file deprecations: top-level Connect chrome keys", () => {
  const config = {
    drives: { allowAddDrive: false, sections: { remote: { enabled: true } } },
    home: { background: "none" },
  };

  it("warns for a host without runner.plugins", () => {
    expect(connectChromeDeprecation(config, false, CONNECT)).toBe(
      "Warning: hosts/connect/host.js: config.drives.allowAddDrive, config.drives.sections, config.home.background are only read by the classic Connect boot, which 6.4 removes. " +
        'List "@powerhousedao/connect/plugins/generic" under runner.plugins and set allowAddDrive, sections, homeBackground in its entry config. ' +
        `See ${MIGRATION_GUIDE_URL}`,
    );
  });

  it("stays silent for a composed host, as the scaffold writes it", () => {
    expect(connectChromeDeprecation(config, true, CONNECT)).toBe(undefined);
  });

  it("stays silent without chrome keys", () => {
    expect(
      connectChromeDeprecation(
        { branding: { appName: "Lab" } },
        false,
        CONNECT,
      ),
    ).toBe(undefined);
    expect(connectChromeDeprecation(undefined, false, CONNECT)).toBe(undefined);
  });
});
