import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormGroup } from "./form-group.js";

describe("FormGroup", () => {
  it("matches snapshot", () => {
    const { asFragment } = render(
      <FormGroup>
        <input type="text" placeholder="Enter text" />
        <label>Sample Label</label>
      </FormGroup>,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("renders children correctly", () => {
    render(
      <FormGroup>
        <input type="text" data-testid="child-input" />
        <label>Test Label</label>
      </FormGroup>,
    );

    expect(screen.getByTestId("child-input")).toBeInTheDocument();
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });
});
