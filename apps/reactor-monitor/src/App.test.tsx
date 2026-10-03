// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App, INSPECTOR_TABS } from "./App.js";

describe("App", () => {
  it("renders the Reactor Monitor shell with sidebar and tab placeholders", () => {
    const { getByRole, getByLabelText, getByText } = render(<App />);

    expect(getByRole("heading", { name: "Reactor Monitor" })).toBeTruthy();
    expect(getByLabelText("Reactor list")).toBeTruthy();

    for (const tab of INSPECTOR_TABS) {
      expect(getByText(tab)).toBeTruthy();
    }
  });
});
