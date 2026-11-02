import {
  applyChildWrapper,
  outputSitesOf,
  planCompound,
} from "@powerhousedao/host-core";
import type { HostExport } from "@powerhousedao/host-core/schema";
import { describe, expect, it } from "vitest";
import { FULL, hostExport, stack } from "./__fixtures__/hosts.js";
import { ladderFlags } from "./flags.js";
import { applyOption, hostOptionList, hostOptions } from "./options.js";
import { applySetters } from "./setters.js";
import { validateDraft } from "./validate.js";

const CONNECT = "host.children.cli-connect";
const AMBIGUOUS =
  "cli-connect reads from switchboard, which cli-switchboard and sb2 both run, so the host won't start. cli-connect has to name the one it uses.";

function withSetters(base: HostExport, setters: Record<string, unknown>) {
  const applied = applySetters(
    base,
    Object.entries(setters).map(([path, value]) => ({
      path,
      value: value as never,
    })),
  );
  expect(applied.issues).toEqual([]);
  return applied.envelope;
}

/** A second switchboard of the scaffold's folder, with its own stores. */
function secondSwitchboard(
  base: HostExport,
  flags = ladderFlags(0),
): HostExport {
  return withSetters(base, {
    "host.children.sb2": {
      host: "switchboard",
      runner: { port: 0 },
      reactor: {
        protocol: { featureFlags: flags },
        backends: {
          main: {
            kind: "in-process",
            storage: { kind: "path", dataDir: ".ph/sb2/reactor-storage" },
            readModel: { url: ".ph/sb2/read-storage" },
          },
        },
      },
    },
  });
}

/** Every `$output` of a child names `member` explicitly. */
function pinned(base: HostExport, child: string, member: string): HostExport {
  const envelope = structuredClone(base);
  const pin = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(pin);
    if (typeof value !== "object" || value === null) return;
    const record = value as Record<string, unknown>;
    const token = record.$output as Record<string, unknown> | undefined;
    if (token && typeof token === "object") token.member = member;
    Object.values(record).forEach(pin);
  };
  pin((envelope.host as { children: Record<string, unknown> }).children[child]);
  return envelope;
}

function outputIssues(envelope: HostExport) {
  return validateDraft({ envelope }, FULL)
    .issues.filter((issue) => issue.rule === "outputs")
    .map(({ path, message }) => [path, message]);
}

/** host-core's compound plan, from each member draft as `ph run` builds it. */
function planThrows(envelope: HostExport): boolean {
  const host = envelope.host as {
    children: Record<string, { host: string }>;
  };
  const members = envelope.members as Record<string, never>;
  try {
    planCompound(
      Object.entries(host.children).map(([key, wrapper]) => ({
        key,
        host: wrapper.host,
        refs: outputSitesOf(
          applyChildWrapper(members[wrapper.host], wrapper as never),
        ).map(({ ref, path }) => ({ ref, path })),
      })),
    );
    return false;
  } catch {
    return true;
  }
}

describe("output links between reactors", () => {
  it("reports a link that names a folder two switchboards run", () => {
    const envelope = secondSwitchboard(hostExport("cli"));
    expect(outputIssues(envelope)).toEqual([[CONNECT, AMBIGUOUS]]);
    expect(
      outputIssues(pinned(envelope, "cli-connect", "cli-switchboard")),
    ).toEqual([]);
  });

  it("reports links to a missing, unknown or misnamed reactor", () => {
    const cli = hostExport("cli");
    const noSwitchboard = withSetters(cli, {
      "host.children.cli-switchboard": { $delete: true },
    });
    expect(outputIssues(noSwitchboard)).toEqual([
      [
        CONNECT,
        "cli-connect reads from switchboard, which no reactor in this host runs, so the host won't start.",
      ],
    ]);
    expect(outputIssues(pinned(cli, "cli-connect", "nope"))).toEqual([
      [
        CONNECT,
        "cli-connect reads from nope, which isn't a reactor in this host, so the host won't start.",
      ],
    ]);
    expect(outputIssues(pinned(cli, "cli-connect", "cli-connect"))).toEqual([
      [
        CONNECT,
        "cli-connect reads from cli-connect as switchboard, but cli-connect runs connect, so the host won't start.",
      ],
    ]);
  });

  it("agrees with host-core's compound plan", () => {
    const cli = hostExport("cli");
    const two = secondSwitchboard(cli);
    for (const [name, envelope] of [
      ["scaffold", cli],
      ["stack", stack()],
      ["two switchboards", two],
      ["two switchboards, pinned", pinned(two, "cli-connect", "sb2")],
      ["unknown member", pinned(cli, "cli-connect", "nope")],
      [
        "no switchboard",
        withSetters(cli, {
          "host.children.cli-switchboard": { $delete: true },
        }),
      ],
    ] as const) {
      expect(outputIssues(envelope).length > 0, name).toBe(
        planThrows(envelope),
      );
    }
  });

  it("disables adding a switchboard that would leave a link unsure", () => {
    const draft = { envelope: hostExport("cli") };
    const add = hostOptions(draft, FULL).find(
      (option) => option.id === "host:add:switchboard",
    );
    expect(add).toMatchObject({
      enabled: false,
      reason: AMBIGUOUS.replaceAll("sb2", "switchboard"),
    });
    const option = hostOptionList(draft).find(
      (candidate) => candidate.id === "host:add:switchboard",
    );
    const added = applyOption(draft, option!).draft;
    expect(planThrows(added.envelope)).toBe(true);
  });
});

describe("access control between reactors that sync", () => {
  it("pairs a pinned link only with the reactor it names", () => {
    const two = secondSwitchboard(hostExport("cli"), ladderFlags(1));
    const protocol = (envelope: HostExport) =>
      validateDraft({ envelope }, FULL)
        .issues.filter((issue) => issue.rule === "protocol")
        .map(({ path, message }) => [path, message]);
    expect(protocol(pinned(two, "cli-connect", "cli-switchboard"))).toEqual([]);
    expect(protocol(pinned(two, "cli-connect", "sb2"))).toEqual([
      [
        `${CONNECT}.reactor.protocol.featureFlags`,
        "cli-connect syncs with sb2, so both need the same access control. Set cli-connect's to match sb2's.",
      ],
    ]);
    // An ambiguous link pairs with no one; the outputs rule reports it once.
    expect(protocol(two)).toEqual([]);
  });
});
