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
    render(<TextField label="Name" value="John Doe" onChange={() => null} />);
    expect(screen.getByDisplayValue("John Doe")).toBeInTheDocument();
  });

  it("should render with default value", () => {
    render(<TextField label="Name" defaultValue="John Doe" />);
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

  it("should display character counter when maxLength is provided", () => {
    render(
      <TextField
        label="Name"
        value="John"
        maxLength={10}
        onChange={() => null}
      />,
    );
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("/10")).toBeInTheDocument();
  });

  it("should display character counter with empty value when maxLength is provided", () => {
    render(
      <TextField label="Name" value="" maxLength={11} onChange={() => null} />,
    );
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("/11")).toBeInTheDocument();
  });

  it("should enable browser autocomplete when autoComplete is true", () => {
    render(<TextField label="Name" autoComplete={true} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("autocomplete", "on");
  });

  it("should disable browser autocomplete when autoComplete is false", () => {
    render(<TextField label="Name" autoComplete={false} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("autocomplete", "off");
  });

  it("should not set autocomplete attribute when autoComplete is undefined", () => {
    render(<TextField label="Name" />);
    expect(screen.getByRole("textbox")).not.toHaveAttribute("autocomplete");
  });

  it("should enable browser spellcheck when spellCheck is true", () => {
    render(<TextField label="Name" spellCheck={true} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("spellcheck", "true");
  });

  it("should disable browser spellcheck when spellCheck is false", () => {
    render(<TextField label="Name" spellCheck={false} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("spellcheck", "false");
  });

  it("should not set spellcheck attribute when spellCheck is undefined", () => {
    render(<TextField label="Name" />);
    expect(screen.getByRole("textbox")).not.toHaveAttribute("spellcheck");
  });
});
