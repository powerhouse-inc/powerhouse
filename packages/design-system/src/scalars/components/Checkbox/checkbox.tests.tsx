import { fireEvent, render, screen } from "@testing-library/react";
import { Checkbox } from "./checkbox";

describe("Checkbox Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(<Checkbox data-testid="checkbox" />);
    expect(asFragment()).toMatchSnapshot();
  });

  it("should render an unchecked checkbox by default", () => {
    render(<Checkbox />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
  });

  it("should apply custom className", () => {
    render(<Checkbox className="custom-class" />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toHaveClass("custom-class");
  });

  it("should be checked when checked prop is true", () => {
    render(<Checkbox checked />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
  });

  it("should be disabled when disabled prop is true", () => {
    render(<Checkbox disabled />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDisabled();
  });

  it("should handle change events", () => {
    const handleChange = vi.fn();
    render(<Checkbox onCheckedChange={handleChange} />);
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it("should be accessible", () => {
    render(<Checkbox aria-label="Accessible Checkbox" />);
    const checkbox = screen.getByLabelText("Accessible Checkbox");
    expect(checkbox).toBeInTheDocument();
  });

  it("should have correct styles when checked", () => {
    render(<Checkbox checked />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toHaveClass("data-[state=checked]:bg-primary");
    expect(checkbox).toHaveClass(
      "data-[state=checked]:text-primary-foreground",
    );
  });

  it("should have correct styles when disabled", () => {
    render(<Checkbox disabled />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toHaveClass("disabled:cursor-not-allowed");
    expect(checkbox).toHaveClass("disabled:opacity-50");
  });

  it("should render the check icon when checked", () => {
    render(<Checkbox checked />);
    const checkIcon = screen.getByTestId("check-icon");
    expect(checkIcon).toBeInTheDocument();
  });

  it("should not render the check icon when unchecked", () => {
    render(<Checkbox />);
    const checkIcon = screen.queryByTestId("check-icon");
    expect(checkIcon).not.toBeInTheDocument();
  });
});
