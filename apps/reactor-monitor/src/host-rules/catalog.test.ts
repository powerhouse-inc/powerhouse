import { hostExportSchema } from "@powerhousedao/host-core/schema";
import { describe, expect, it } from "vitest";
import { FULL, hostExport, stack } from "./__fixtures__/hosts.js";
import {
  ADD_REASONS,
  applyOption,
  blankExport,
  checkSetter,
  folderTemplate,
  hostOptions,
  validateDraft,
  type HostDraft,
  type OptionStatus,
} from "./index.js";

function addOption(draft: HostDraft, role: string): OptionStatus {
  const option = hostOptions(draft, FULL).find(
    (candidate) => candidate.group === "add" && candidate.value === role,
  );
  if (!option) throw new Error(`no add ${role}`);
  return option;
}

function add(draft: HostDraft, role: string): HostDraft {
  const option = addOption(draft, role);
  expect(option.reason).toBeUndefined();
  const applied = applyOption(draft, option);
  expect(applied.refused).toBeUndefined();
  return applied.draft;
}

describe("folder catalog", () => {
  it("writes the folders `ph init` scaffolds", () => {
    const named = {
      ...blankExport(),
      project: { ...blankExport().project, name: "my-project" },
    };
    expect(folderTemplate(named, "switchboard")).toEqual(
      hostExport("switchboard").host,
    );
    expect(folderTemplate(named, "connect")).toEqual(
      hostExport("connect").host,
    );
  });

  it("is only for a blank host", () => {
    expect(folderTemplate(stack(), "switchboard")).toBeUndefined();
    expect(folderTemplate(blankExport(), "vetra")).toBeUndefined();
  });

  it("starts from an export with no reactors and no issues", () => {
    const draft = { envelope: blankExport() };
    expect(hostExportSchema.safeParse(draft.envelope).success).toBe(true);
    const validation = validateDraft(draft, FULL);
    expect(validation.members).toEqual([]);
    expect(validation.issues).toEqual([]);
  });

  it("adds a switchboard and Connect to a blank host from the catalog", () => {
    const blank = { envelope: blankExport() };
    expect(addOption(blank, "switchboard").setters).toEqual([
      {
        path: "members.switchboard",
        value: folderTemplate(blank.envelope, "switchboard"),
      },
      { path: "host.children.switchboard", value: { host: "switchboard" } },
    ]);
    const both = add(add(blank, "switchboard"), "connect");
    expect(hostExportSchema.safeParse(both.envelope).success).toBe(true);
    const validation = validateDraft(both, FULL);
    expect(validation.issues).toEqual([]);
    expect(validation.members.map((member) => member.role)).toEqual([
      "switchboard",
      "connect",
    ]);
  });

  it("adds a second switchboard from the folder the first one wrote", () => {
    const once = add({ envelope: blankExport() }, "switchboard");
    const option = addOption(once, "switchboard");
    expect(option.setters.map((setter) => setter.path)).toEqual([
      "host.children.switchboard-2",
    ]);
    const twice = applyOption(once, option).draft;
    expect(validateDraft(twice, FULL).issues).toEqual([]);
  });

  it("still names a project host's missing folder", () => {
    const envelope = stack();
    const host = envelope.host as { children: Record<string, unknown> };
    delete host.children.ui;
    delete (envelope.members as Record<string, unknown>).connect;
    expect(addOption({ envelope }, "connect").reason).toBe(
      ADD_REASONS.noConnect,
    );
  });
});

describe("catalog policy", () => {
  const template = folderTemplate(blankExport(), "switchboard") as never;

  it("lets a blank host add a folder only as the catalog writes it", () => {
    const blank = blankExport();
    expect(
      checkSetter({ path: "members.switchboard", value: template }, blank),
    ).toEqual({ ok: true });
    const changed = {
      ...(template as Record<string, unknown>),
      runner: { module: "./evil.js" },
    };
    expect(
      checkSetter({ path: "members.switchboard", value: changed }, blank).ok,
    ).toBe(false);
    expect(
      checkSetter({ path: "members.vetra", value: template }, blank).ok,
    ).toBe(false);
  });

  it("never replaces a folder another host already has", () => {
    expect(
      checkSetter({ path: "members.switchboard", value: template }, stack()).ok,
    ).toBe(false);
    const blank = {
      ...blankExport(),
      members: { switchboard: hostExport("connect").host },
    };
    expect(
      checkSetter({ path: "members.switchboard", value: template }, blank).ok,
    ).toBe(false);
  });

  it("lets a blank host's child run a catalog folder before it is written", () => {
    const blank = blankExport();
    expect(
      checkSetter(
        { path: "host.children.sb", value: { host: "switchboard" } },
        blank,
      ),
    ).toEqual({ ok: true });
    expect(
      checkSetter({ path: "host.children.x", value: { host: "vetra" } }, blank)
        .ok,
    ).toBe(false);
  });
});
