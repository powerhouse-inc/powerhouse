import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Editor } from "./editor.js";

describe("VetraPackage Editor", () => {
  it("should render the Name label", () => {
    render(<Editor />);
    expect(screen.getByText("Name")).toBeInTheDocument();
  });
});
