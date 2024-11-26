import { screen } from "@testing-library/react";
import { AmountField } from "./amount-field";
import { renderWithForm } from "@/scalars/lib/testing";

describe("AmountField Component", () => {
  it("should match snapshot", () => {
    const { container } = renderWithForm(
      <AmountField
        selectName="currency"
        label="Amount Label"
        name="amount"
        type="Amount"
        value={{
          type: "Amount",
          details: {
            amount: 345,
          },
        }}
      />,
    );
    expect(container).toMatchSnapshot();
  });

  it("should render label when provided", () => {
    renderWithForm(
      <AmountField
        selectName="currency"
        label="Amount Label"
        name="amount"
        value={{
          type: "Amount",
          details: {
            amount: 345,
          },
        }}
      />,
    );
    expect(screen.getByLabelText("Amount Label")).toBeInTheDocument();
  });

  it("should render error messages when provided", () => {
    renderWithForm(
      <AmountField
        selectName="currency"
        label="Amount Label"
        name="amount"
        value={{
          type: "Amount",
          details: {
            amount: 345,
          },
        }}
        errors={["Error 1", "Error 2"]}
      />,
    );
    expect(screen.getByText("Error 1")).toBeInTheDocument();
    expect(screen.getByText("Error 2")).toBeInTheDocument();
  });

  it("should render the percentage sign if the type is percent", () => {
    renderWithForm(
      <AmountField
        selectName="currency"
        label="Amount Label"
        name="amount"
        value={{
          type: "AmountPercentage",
          details: {
            amount: 345,
          },
        }}
      />,
    );
    expect(screen.getByText("%")).toBeInTheDocument();
  });

  it("should disable the input when disabled prop is true", () => {
    renderWithForm(
      <AmountField
        selectName="currency"
        label="Amount Label"
        name="amount"
        value={{
          type: "Amount",
          details: {
            amount: 345,
          },
        }}
        disabled
        type="Amount"
      />,
    );
    const input = screen.getByRole("spinbutton");

    expect(input).toBeDisabled();
  });

  it("should set the input as required when required prop is true", () => {
    renderWithForm(
      <AmountField
        selectName="currency"
        label="Amount Label"
        name="amount"
        value={{
          type: "Amount",
          details: {
            amount: 345,
          },
        }}
        required
        type="Amount"
      />,
    );
    expect(screen.getByRole("spinbutton")).toHaveAttribute("required");
  });

  it("should render the description when provided", () => {
    renderWithForm(
      <AmountField
        selectName="currency"
        label="Amount Label"
        name="amount"
        value={{
          type: "Amount",
          details: {
            amount: 345,
          },
        }}
        disabled
        type="Amount"
        description="This is a description"
      />,
    );
    expect(screen.getByText("This is a description")).toBeInTheDocument();
  });
});
