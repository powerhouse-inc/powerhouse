// @vitest-environment happy-dom
import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FULL, stack } from "../../host-rules/__fixtures__/hosts.js";
import { NAME_REASON } from "../../host-rules/index.js";
import { renderStep } from "../__fixtures__/steps.js";
import { BasicsStep } from "./BasicsStep.js";

describe("BasicsStep", () => {
  it("writes one setter for a name, on Enter, and refuses an unsafe one", () => {
    const { view, onEdit } = renderStep(BasicsStep, {
      envelope: stack(),
      context: FULL,
    });
    expect(view.getByText("hosts/stack/")).toBeTruthy();
    const name = view.getByRole("textbox", { name: /Name/ });
    fireEvent.change(name, { target: { value: "../escape" } });
    fireEvent.blur(name);
    expect(view.getByText(NAME_REASON)).toBeTruthy();
    expect(onEdit).not.toHaveBeenCalled();

    fireEvent.change(name, { target: { value: "stack-2" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(onEdit).toHaveBeenCalledExactlyOnceWith([
      { path: "host.name", value: "stack-2" },
    ]);
    expect(view.queryByText(NAME_REASON)).toBeNull();
  });
});
