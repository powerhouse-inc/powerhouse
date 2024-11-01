import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextField } from "./text-field";

describe("TextField", () => {
  it("should match snapshot", () => {
    const { container } = render(<TextField label="Test Label" />);
    expect(container).toMatchSnapshot();
  });

  it("should render with label", () => {
    render(<TextField label="Field Label" />);
    expect(screen.getByText("Field Label")).toBeInTheDocument();
  });

  it("should show required indicator when required", () => {
    render(<TextField label="Name" required />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("should render with initial value", () => {
    render(<TextField label="Name" value="John Doe" />);
    expect(screen.getByDisplayValue("John Doe")).toBeInTheDocument();
  });

  it("should render with default value", () => {
    render(<TextField label="Name" default="John Doe" />);
    expect(screen.getByDisplayValue("John Doe")).toBeInTheDocument();
  });

  it("should render in disabled state", () => {
    render(<TextField label="Name" disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("should display error messages", () => {
    render(<TextField label="Name" errors={["Name is required"]} />);
    expect(screen.getByText("Name is required")).toBeInTheDocument();
  });

  it("should display warning messages", () => {
    render(<TextField label="Name" warnings={["Name is too long"]} />);
    expect(screen.getByText("Name is too long")).toBeInTheDocument();
  });

  it("should allow user input", async () => {
    const user = userEvent.setup();
    render(<TextField label="Name" />);

    const input = screen.getByRole("textbox");
    await user.type(input, "John Doe");

    expect(input).toHaveValue("John Doe");
  });
});
