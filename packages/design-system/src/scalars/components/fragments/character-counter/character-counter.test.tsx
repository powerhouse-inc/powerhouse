import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CharacterCounter } from "./character-counter";

describe("CharacterCounter", () => {
  it("should match snapshot", () => {
    const { container } = render(
      <CharacterCounter maxLength={10} value="Hello" />,
    );
    expect(container).toMatchSnapshot();
  });

  it("should display correct character count and max length", () => {
    render(<CharacterCounter maxLength={10} value="Hello" />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("/10")).toBeInTheDocument();
  });

  it("should show normal state when under 90% of max length", () => {
    render(<CharacterCounter maxLength={10} value="Hello" />);
    expect(screen.getByText("5")).toHaveClass("text-gray-500");
    expect(screen.getByText("/10")).toHaveClass("text-gray-300");
  });

  it("should show warning state when between 90% and 100% of max length", () => {
    render(<CharacterCounter maxLength={10} value="Hello Wor" />);
    expect(screen.getByText("9")).toHaveClass("text-yellow-900");
    expect(screen.getByText("/10")).toHaveClass("text-yellow-400");
  });

  it("should show error state when at or exceeding max length", () => {
    render(<CharacterCounter maxLength={10} value="Hello World" />);
    expect(screen.getByText("11")).toHaveClass("text-red-900");
    expect(screen.getByText("/10")).toHaveClass("text-red-400");
  });

  it("should handle empty string value", () => {
    render(<CharacterCounter maxLength={10} value="" />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("0")).toHaveClass("text-gray-500");
  });
});
