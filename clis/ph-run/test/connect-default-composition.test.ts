import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hostSchema,
  servesDefaultComposition,
  withDefaultComposition,
  type ConnectHost,
} from "../src/runners/connect.js";

// A host without `runner.plugins` is served Connect's default composition:
// the built-ins that the config Connect is served has on.

const GENERIC = "@powerhousedao/connect/plugins/generic";
const SENTRY = "@powerhousedao/connect/plugins/sentry";
const OPENPANEL = "@powerhousedao/connect/plugins/openpanel";
const ASSISTANT = "@powerhousedao/connect/plugins/assistant";
const STUDIO = "@powerhousedao/vetra-studio/connect";
const WORKFLOWS = "@powerhousedao/connect/plugins/workflows";

const SECTION = { enabled: true, allowAdd: true, allowDelete: true };

const modules = (
  ...args: Parameters<typeof withDefaultComposition>
): string[] =>
  (withDefaultComposition(...args).composition ?? []).map(
    (entry) => entry.module,
  );

describe("withDefaultComposition", () => {
  it("composes the always-on built-ins with the default values, for no config at all", () => {
    expect(withDefaultComposition(undefined, {})).toEqual({
      composition: [
        {
          module: GENERIC,
          config: {
            allowAddDrive: true,
            sections: { remote: SECTION, local: SECTION },
          },
        },
        { module: SENTRY, config: {} },
        {
          module: OPENPANEL,
          config: { clientId: "", trackUiEvents: true, trackOperations: true },
        },
      ],
    });
  });

  it("keeps the override as it is and adds the composition", () => {
    const override = { branding: { appName: "Lab" } };
    const served = withDefaultComposition(override, {});
    expect(served).toMatchObject(override);
    expect(Object.keys(served).sort()).toEqual(["branding", "composition"]);
    // The override is not changed.
    expect(override).toEqual({ branding: { appName: "Lab" } });
  });

  it("reads the project's config file under the override", () => {
    const source = {
      connect: {
        drives: { allowAddDrive: false },
        ai: { assistantEnabled: true },
        sentry: { dsn: "https://k@sentry.example/1" },
      },
    };
    const fromSource = withDefaultComposition(undefined, source as never);
    expect(fromSource.composition?.map((entry) => entry.module)).toEqual([
      GENERIC,
      SENTRY,
      OPENPANEL,
      ASSISTANT,
    ]);
    expect(fromSource.composition?.[0].config).toMatchObject({
      allowAddDrive: false,
    });
    expect(fromSource.composition?.[1].config).toEqual({
      dsn: "https://k@sentry.example/1",
    });
    // The override wins over the file, value by value.
    const overridden = withDefaultComposition(
      {
        drives: { allowAddDrive: true },
        ai: { assistantEnabled: false },
        sentry: { dsn: null },
      } as never,
      source as never,
    );
    expect(overridden.composition?.map((entry) => entry.module)).toEqual([
      GENERIC,
      SENTRY,
      OPENPANEL,
    ]);
    expect(overridden.composition?.[0].config).toMatchObject({
      allowAddDrive: true,
    });
    expect(overridden.composition?.[1].config).toEqual({});
  });

  it("follows the project-wide workflows switch unless Connect's own is set", () => {
    expect(modules(undefined, { workflows: { enabled: true } })).toContain(
      WORKFLOWS,
    );
    expect(modules(undefined, { workflows: { enabled: false } })).not.toContain(
      WORKFLOWS,
    );
    expect(
      modules(undefined, {
        workflows: { enabled: true },
        connect: { app: { workflowsEnabled: false } },
      } as never),
    ).not.toContain(WORKFLOWS);
    expect(
      modules({ app: { workflowsEnabled: true } } as never, {
        workflows: { enabled: false },
      }),
    ).toContain(WORKFLOWS);
  });

  it("counts what the service lays over the override: Studio's studio mode", () => {
    expect(modules(undefined, {})).not.toContain(STUDIO);
    const studio = { app: { studioMode: true } };
    expect(modules(undefined, {}, studio)).toContain(STUDIO);
    // Studio switches it on over a host that sets it off, as it always has.
    expect(
      modules({ app: { studioMode: false } } as never, {}, studio),
    ).toContain(STUDIO);
    // The value itself stays the service's to set.
    expect(withDefaultComposition(undefined, {}, studio)).not.toHaveProperty(
      "app",
    );
  });
});

describe("servesDefaultComposition", () => {
  afterEach(() => vi.restoreAllMocks());

  const host = (runner: Partial<ConnectHost["runner"]> = {}) =>
    hostSchema.parse({
      name: "lab-connect",
      runner: { module: "@powerhousedao/ph-run/runners/connect", ...runner },
    });

  it("is on, and says so in one line, for a host without runner.plugins", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(servesDefaultComposition(host())).toBe(true);
    expect(log.mock.calls).toEqual([
      [
        "[connect] hosts/lab-connect/host.js declares no runner.plugins: serving Connect's default composition.",
      ],
    ]);
  });

  it("is off, and silent, for a host that declares a plugins list, an empty one too", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(servesDefaultComposition(host({ plugins: [] }))).toBe(false);
    expect(
      servesDefaultComposition(
        host({ plugins: ["@powerhousedao/connect/plugins/generic"] }),
      ),
    ).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });
});
