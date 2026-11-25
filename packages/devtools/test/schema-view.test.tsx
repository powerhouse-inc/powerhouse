// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SchemaDiagramView } from "../src/build/models/schema-view.js";

vi.mock("../src/build/models/schema-diagram.js", () => ({
  SchemaDiagram: () => {
    throw new Error("The layout failed.");
  },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SchemaDiagramView", () => {
  it("keeps a failing diagram to itself and offers the SDL", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onShowSdl = vi.fn();
    render(
      <SchemaDiagramView
        schema="type A { b: String }"
        label="Invoice global state"
        onShowSdl={onShowSdl}
      />,
    );
    const panel = await screen.findByTestId("ph-diagram-unavailable");
    expect(panel.textContent).toContain("Diagram unavailable");
    expect(panel.textContent).toContain("The layout failed.");
    fireEvent.click(screen.getByRole("button", { name: "Show SDL" }));
    expect(onShowSdl).toHaveBeenCalledOnce();
  });
});
