import { renderWithForm } from "@powerhousedao/design-system";
import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { TextField } from "./text-field.js";

describe("TextField", () => {
  it("should match snapshot", () => {
    const { container } = renderWithForm(
      <TextField name="test" label="Test Label" />,
    );
    expect(container).toMatchSnapshot();
  });

  it("should render with label", () => {
    renderWithForm(<TextField name="field" label="Field Label" />);
    expect(screen.getByText("Field Label")).toBeInTheDocument();
  });

  it("should show required indicator when required", () => {
    renderWithForm(<TextField name="name" label="Name" required />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("should render with initial value", () => {
    renderWithForm(
      <TextField
        name="name"
        label="Name"
        value="John Doe"
        onChange={() => null}
      />,
    );
    expect(screen.getByDisplayValue("John Doe")).toBeInTheDocument();
  });

  it("should render with default value", () => {
    renderWithForm(
      <TextField name="name" label="Name" defaultValue="John Doe" />,
    );
    expect(screen.getByDisplayValue("John Doe")).toBeInTheDocument();
  });

  it("should render in disabled state", () => {
    renderWithForm(<TextField name="name" label="Name" disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("should display error messages", async () => {
    renderWithForm(
      <TextField name="name" label="Name" errors={["Name is required"]} />,
    );
    await waitFor(() =>
      expect(screen.getByText("Name is required")).toBeInTheDocument(),
    );
  });

  it("should display warning messages", () => {
    renderWithForm(
      <TextField name="name" label="Name" warnings={["Name is too long"]} />,
    );
    expect(screen.getByText("Name is too long")).toBeInTheDocument();
  });

  it("should allow user input", async () => {
    const user = userEvent.setup();
    renderWithForm(<TextField name="name" label="Name" />);

    const input = screen.getByRole("textbox");
    await user.type(input, "John Doe");

    expect(input).toHaveValue("John Doe");
  });

  it("should display character counter when maxLength is provided", () => {
    renderWithForm(
      <TextField
        name="name"
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
    renderWithForm(
      <TextField
        name="name"
        label="Name"
        value=""
        maxLength={11}
        onChange={() => null}
      />,
    );
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("/11")).toBeInTheDocument();
  });

  it("should enable browser autocomplete when autoComplete is true", () => {
    renderWithForm(<TextField name="name" label="Name" autoComplete={true} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("autocomplete", "on");
  });

  it("should disable browser autocomplete when autoComplete is false", () => {
    renderWithForm(<TextField name="name" label="Name" autoComplete={false} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("autocomplete", "off");
  });

  it("should not set autocomplete attribute when autoComplete is undefined", () => {
    renderWithForm(<TextField name="name" label="Name" />);
    expect(screen.getByRole("textbox")).not.toHaveAttribute("autocomplete");
  });

  it("should enable browser spellcheck when spellCheck is true", () => {
    renderWithForm(<TextField name="name" label="Name" spellCheck={true} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("spellcheck", "true");
  });

  it("should disable browser spellcheck when spellCheck is false", () => {
    renderWithForm(<TextField name="name" label="Name" spellCheck={false} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("spellcheck", "false");
  });

  it("should not set spellcheck attribute when spellCheck is undefined", () => {
    renderWithForm(<TextField name="name" label="Name" />);
    expect(screen.getByRole("textbox")).not.toHaveAttribute("spellcheck");
  });
});
