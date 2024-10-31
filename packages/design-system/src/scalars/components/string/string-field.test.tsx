import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StringField } from "./string-field";

describe("StringField", () => {
  it("should render with label", () => {
    render(<StringField label="Field Label" />);
    expect(screen.getByText("Field Label")).toBeInTheDocument();
  });

  it("should show required indicator when required", () => {
    render(<StringField label="Name" required />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("should render with initial value", () => {
    render(<StringField label="Name" value="John Doe" />);
    expect(screen.getByDisplayValue("John Doe")).toBeInTheDocument();
  });

  it("should render with default value", () => {
    render(<StringField label="Name" default="John Doe" />);
    expect(screen.getByDisplayValue("John Doe")).toBeInTheDocument();
  });

  it("should render in disabled state", () => {
    render(<StringField label="Name" disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("should display error messages", () => {
    render(<StringField label="Name" errors={["Name is required"]} />);
    expect(screen.getByText("Name is required")).toBeInTheDocument();
  });

  it("should display warning messages", () => {
    render(<StringField label="Name" warnings={["Name is too long"]} />);
    expect(screen.getByText("Name is too long")).toBeInTheDocument();
  });

  it("should allow user input", async () => {
    const user = userEvent.setup();
    render(<StringField label="Name" />);

    const input = screen.getByRole("textbox");
    await user.type(input, "John Doe");

    expect(input).toHaveValue("John Doe");
  });
});
