// @vitest-environment happy-dom
import { fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BARE, FULL, stack } from "../../host-rules/__fixtures__/hosts.js";
import {
  HOT_RELOAD_REASONS,
  REASONS,
  SETTING_REASONS,
} from "../../host-rules/index.js";
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
});
