import { MIGRATION_GUIDE_URL } from "@powerhousedao/shared/clis/deprecations";
import { describe, expect, it } from "vitest";
import {
  connectChromeDeprecation,
  reactorWorkflowsDeprecation,
} from "../src/runners/host-deprecations.js";
import { readModelAsReactorStore } from "../src/runners/member-config.js";

const SWITCHBOARD = "hosts/switchboard/host.js";
const CONNECT = "hosts/connect/host.js";

describe("host file deprecations: reactor.workflows", () => {
  it.each([true, false])("warns when the boolean is %j", (workflows) => {
    expect(
      reactorWorkflowsDeprecation(
        { workflows },
        SWITCHBOARD,
        "@powerhousedao/switchboard/plugins/workflows",
      ),
    ).toBe(
      "Warning: hosts/switchboard/host.js: reactor.workflows is deprecated and stops working in 6.4. " +
        'Workflows are a plugin: "@powerhousedao/switchboard/plugins/workflows" under runner.plugins switches them on, leaving it out switches them off. ' +
        `Remove the key. See ${MIGRATION_GUIDE_URL}`,
    );
  });

  it("names the Connect plugin for a Connect host", () => {
    expect(
      reactorWorkflowsDeprecation(
        { workflows: true },
        CONNECT,
        "@powerhousedao/connect/plugins/workflows",
      ),
    ).toContain('"@powerhousedao/connect/plugins/workflows"');
  });

  it("stays silent for a host that does not set it", () => {
    expect(reactorWorkflowsDeprecation(undefined, SWITCHBOARD, "p")).toBe(
      undefined,
    );
    expect(
      reactorWorkflowsDeprecation({ namespace: "lab" }, SWITCHBOARD, "p"),
    ).toBe(undefined);
  });
});

describe("host file deprecations: the readModel.url fallback", () => {
  const reactor = {
    backends: {
      main: {
        kind: "in-process" as const,
        readModel: { url: "postgres://host/db" },
      },
    },
  };

  it("names the release and the migration page", () => {
    const legacy = readModelAsReactorStore(reactor, {}, SWITCHBOARD);
    expect(legacy?.warning).toContain(
      "also holds the reactor store, because no storage names one. This is deprecated and stops working in 6.4:",
    );
    expect(legacy?.warning).toContain(`See ${MIGRATION_GUIDE_URL}`);
  });

  it("stays silent when something names the store", () => {
    expect(
      readModelAsReactorStore(
        reactor,
        { PH_REACTOR_DATABASE_URL: "postgres://host/store" },
        SWITCHBOARD,
      ),
    ).toBe(undefined);
    expect(readModelAsReactorStore(undefined, {}, SWITCHBOARD)).toBe(undefined);
  });
});

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
