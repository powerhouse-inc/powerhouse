// @vitest-environment happy-dom
import { fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BARE,
  FULL,
  hostExport,
  stack,
} from "../../host-rules/__fixtures__/hosts.js";
import { ADD_REASONS, REASONS } from "../../host-rules/index.js";
import { renderStep } from "../__fixtures__/steps.js";
import { MembersStep } from "./MembersStep.js";

describe("MembersStep", () => {
  it("says a single-reactor host can't take more", () => {
    const { view } = renderStep(MembersStep, {
      envelope: hostExport("switchboard"),
      context: FULL,
    });
    const add = within(view.getByRole("group", { name: "Add a reactor" }));
    expect(add.getByRole("button", { name: "Switchboard" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(add.getAllByText(ADD_REASONS.single)).toHaveLength(2);
  });

  it("needs the controller to add a switchboard", () => {
    const { view } = renderStep(MembersStep, {
      envelope: stack(),
      context: { ...BARE, controller: false },
    });
    const add = within(view.getByRole("group", { name: "Add a reactor" }));
    expect(add.getByText(REASONS.noController)).toBeTruthy();
  });

  it("lists the reactors and adds one", () => {
    const { view, onChoose } = renderStep(MembersStep, {
      envelope: stack(),
      context: FULL,
    });
    expect(view.getByText("sb")).toBeTruthy();
    expect(view.getByText("ui")).toBeTruthy();
    const add = within(view.getByRole("group", { name: "Add a reactor" }));
    const button = add.getByRole("button", { name: "Switchboard" });
    expect(button.getAttribute("aria-pressed")).toBeNull();
    fireEvent.click(button);
    expect(onChoose).toHaveBeenCalledWith(
      expect.objectContaining({ id: "host:add:switchboard" }),
    );
  });
});
