// @vitest-environment happy-dom
import { fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HostExport } from "@powerhousedao/host-core/schema";
import {
  BARE,
  FULL,
  hostExport,
  stack,
} from "../../host-rules/__fixtures__/hosts.js";
import {
  addDriveStatus,
  applyOption,
  hostOptions,
  HOT_RELOAD_REASONS,
  REACH_REASONS,
  REASONS,
  SETTING_REASONS,
  type Setter,
} from "../../host-rules/index.js";
import { DRIVES_COPY } from "../copy.js";
import { renderStep, type RenderedStep } from "../__fixtures__/steps.js";
import { ReactorStep } from "./ReactorStep.js";

const POSTGRES = [
  {
    path: "members.switchboard.reactor.backends.main",
    value: { kind: "in-process", storage: { kind: "postgres" } },
  },
];

function group(view: RenderedStep["view"], name: string) {
  return within(view.getByRole("group", { name }));
}

/** The setters the builder records for these options, chosen in order;
 * `drive:<name>` adds a named drive to sb. */
function chosen(envelope: HostExport, ids: string[]): Setter[] {
  let draft = { envelope };
  const setters: Setter[] = [];
  for (const id of ids) {
    const option = id.startsWith("drive:")
      ? addDriveStatus(draft, FULL, "host.children.sb", id.slice(6))
      : hostOptions(draft, FULL).find((candidate) => candidate.id === id);
    if (!option?.enabled) throw new Error(`${id} is not on`);
    setters.push(...option.setters);
    draft = applyOption(draft, option).draft;
  }
  return setters;
}

function drivesCard(view: RenderedStep["view"]) {
  return within(
    view.getByRole("region", { name: "Where this app keeps its drives" }),
  );
}

describe("ReactorStep", () => {
  it("turns off Postgres when the controller has none, and says why", () => {
    const { view } = renderStep(ReactorStep, {
      envelope: stack(),
      context: BARE,
    });
    const storage = group(view, "Storage");
    expect(storage.getByRole("button", { name: "Postgres" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(storage.getByText(REASONS.noPostgres)).toBeTruthy();
    expect(
      storage
        .getByRole("button", { name: "Folder on disk" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("explains why hot reload can't go on while workers run", () => {
    const { view } = renderStep(ReactorStep, {
      envelope: stack(),
      setters: POSTGRES,
      env: { REACTOR_WORKERS: "2" },
      context: FULL,
    });
    const hotReload = group(view, "Hot reload");
    expect(hotReload.getByRole("button", { name: "On" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(hotReload.getByText(HOT_RELOAD_REASONS.workers)).toBeTruthy();
    const workers = group(view, "Background workers");
    expect(workers.getByRole("button", { name: "4" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(workers.getAllByText(SETTING_REASONS.fromEnv).length).toBe(3);
  });

  it("chooses an enabled option, one reactor at a time", () => {
    const { view, onChoose } = renderStep(ReactorStep, {
      envelope: stack(),
      context: FULL,
    });
    fireEvent.click(
      group(view, "Storage").getByRole("button", { name: "Postgres" }),
    );
    expect(onChoose).toHaveBeenCalledWith(
      expect.objectContaining({ id: "host.children.sb:storage:main:postgres" }),
    );
    const access = group(view, "Access control");
    expect(
      access.getAllByRole("button").map((button) => button.textContent),
    ).toEqual([
      "Off",
      "Deletion history",
      "Deletion history, Permissions",
      "Deletion history, Permissions, Groups",
      "Deletion history, Permissions, Groups, Conditions",
    ]);
    fireEvent.click(view.getByRole("tab", { name: /ui/ }));
    expect(view.queryByRole("group", { name: "Hot reload" })).toBeNull();
  });

  describe("Where this app keeps its drives", () => {
    it("offers to add a drive to the switchboard when the names clash", () => {
      const { view, onChoose } = renderStep(ReactorStep, {
        envelope: stack(),
        context: FULL,
      });
      fireEvent.click(view.getByRole("tab", { name: /ui/ }));
      const card = drivesCard(view);
      expect(
        card.getByRole("group", { name: "In this browser: Storage" }),
      ).toBeTruthy();
      const add = within(card.getByRole("group", { name: DRIVES_COPY.add }));
      expect(
        add.getByRole("button", { name: "Open powerhouse on sb" }),
      ).toHaveProperty("disabled", true);
      expect(add.getByText(REACH_REASONS.clash("powerhouse"))).toBeTruthy();
      const name = card.getByRole("textbox", {
        name: `${DRIVES_COPY.driveName} for sb`,
      });
      const addDrive = card.getByRole("button", {
        name: DRIVES_COPY.addButton,
      });
      expect(addDrive).toHaveProperty("disabled", true);
      fireEvent.change(name, { target: { value: "my-project" } });
      expect(addDrive).toHaveProperty("disabled", true);
      expect(
        card.getByText(REACH_REASONS.nameTaken("my-project")),
      ).toBeTruthy();
      fireEvent.change(name, { target: { value: "Team notes" } });
      expect(addDrive).toHaveProperty("disabled", false);
      fireEvent.click(addDrive);
      expect(onChoose).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "host.children.sb:reach:addDrive:team-notes",
          enabled: true,
        }),
      );
      expect(name).toHaveProperty("value", "");
      expect(card.getByText(DRIVES_COPY.newDrives)).toBeTruthy();
    });

    it("shows a linked drive and where it opens", () => {
      const envelope = stack();
      const { view, onChoose } = renderStep(ReactorStep, {
        envelope,
        setters: chosen(envelope, [
          "drive:Shared",
          "host.children.ui:reach:open:sb:shared",
        ]),
        context: FULL,
      });
      fireEvent.click(view.getByRole("tab", { name: /ui/ }));
      const row = within(
        drivesCard(view).getByRole("group", { name: "shared on sb" }),
      );
      expect(
        row
          .getByRole("button", { name: "On sb only" })
          .getAttribute("aria-pressed"),
      ).toBe("true");
      expect(
        row
          .getByRole("button", { name: "Copy in this browser" })
          .getAttribute("aria-pressed"),
      ).toBe("false");
      expect(drivesCard(view).getByText(DRIVES_COPY.moveLater)).toBeTruthy();
      fireEvent.click(row.getByRole("button", { name: "Remove" }));
      expect(onChoose).toHaveBeenCalledWith(
        expect.objectContaining({ id: "host.children.ui:reach:unlink:shared" }),
      );
    });

    it("says every drive opens on the switchboard when Connect keeps none", () => {
      const { view } = renderStep(ReactorStep, {
        envelope: hostExport("cli"),
        context: FULL,
      });
      fireEvent.click(view.getByRole("tab", { name: /cli-connect/ }));
      const card = drivesCard(view);
      const row = within(
        card.getByRole("group", { name: "powerhouse on cli-switchboard" }),
      );
      expect(
        row.getByRole("button", { name: "Copy in this browser" }),
      ).toHaveProperty("disabled", true);
      expect(row.getByText(REACH_REASONS.remoteOnly)).toBeTruthy();
      expect(card.getByText(REACH_REASONS.mapped)).toBeTruthy();
      expect(card.queryByText(DRIVES_COPY.newDrives)).toBeNull();
      expect(
        card.getByRole("button", { name: "Keep drives in this browser" }),
      ).toHaveProperty("disabled", false);
    });
  });
});
