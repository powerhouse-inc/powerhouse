import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormDescription } from "./form-description";

describe("FormDescription", () => {
  it("should render correctly", () => {
    const { container } = render(
      <FormDescription>Test description</FormDescription>,
    );
    expect(container).toMatchSnapshot();
  });

  it("should render children content", () => {
    render(<FormDescription>Test description</FormDescription>);
    expect(screen.getByText("Test description")).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    render(
      // for testing purposes, we disable the no-custom-classname rule

      <FormDescription className="custom-class">
        Test description
      </FormDescription>,
    );
    expect(screen.getByText("Test description")).toHaveClass("custom-class");
  });

  it("should render with custom element type", () => {
    render(<FormDescription as="span">Test description</FormDescription>);
    expect(screen.getByText("Test description").tagName).toBe("SPAN");
  });

  it("should use paragraph as default element type", () => {
    render(<FormDescription>Test description</FormDescription>);
    expect(screen.getByText("Test description").tagName).toBe("P");
  });
});
