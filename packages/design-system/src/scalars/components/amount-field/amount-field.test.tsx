import { screen, waitFor } from "@testing-library/react";
import { AmountField } from "./amount-field";
import { renderWithForm } from "@/scalars/lib/testing";
import { commonCryptoCurrencies } from "../currency-code-field";

describe("AmountField Component", () => {
  it("should match snapshot", () => {
    const { container } = renderWithForm(
      <AmountField
        label="Amount Label"
        name="amount"
        type="Amount"
        value={{
          amount: 345,
        }}
        units={commonCryptoCurrencies}
      />,
    );
    expect(container).toMatchSnapshot();
  });

  it("should render label when provided", () => {
    renderWithForm(
      <AmountField
        label="Amount Label"
        name="amount"
        type="Amount"
        value={{
          amount: 345,
        }}
        units={commonCryptoCurrencies}
      />,
    );
    expect(screen.getByLabelText("Amount Label")).toBeInTheDocument();
  });

  it("should render error messages when provided", async () => {
    renderWithForm(
      <AmountField
        label="Amount Label"
        name="amount"
        type="Amount"
        value={{
          amount: 345,
        }}
        errors={["Error 1", "Error 2"]}
        validators={() => "Error 3"}
        units={commonCryptoCurrencies}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Error 1")).toBeInTheDocument();
      expect(screen.getByText("Error 2")).toBeInTheDocument();
      expect(screen.getByText("Error 3")).toBeInTheDocument();
    });
  });

  it("should render the percentage sign if the type is percent", () => {
    renderWithForm(
      <AmountField
        label="Amount Label"
        name="amount"
        type="AmountPercentage"
        value={345}
        step={0}
        units={commonCryptoCurrencies}
      />,
    );
    expect(screen.getByText("%")).toBeInTheDocument();
  });

  it("should disable the input when disabled prop is true", () => {
    renderWithForm(
      <AmountField
        label="Amount Label"
        name="amount"
        type="Amount"
        value={{
          amount: 345,
        }}
        units={commonCryptoCurrencies}
        disabled
      />,
    );
    const input = screen.getByLabelText("Amount Label");

    expect(input).toBeDisabled();
  });

  it("should set the input as required when required prop is true", () => {
    renderWithForm(
      <AmountField
        label="Amount Label"
        name="amount"
        type="Amount"
        value={{
          amount: 345,
        }}
        required
        units={commonCryptoCurrencies}
      />,
    );
    expect(screen.getByRole("spinbutton")).toHaveAttribute("required");
  });

  it("should render the description when provided", () => {
    renderWithForm(
      <AmountField
        label="Amount Label"
        name="amount"
        type="Amount"
        value={{
          amount: 345,
        }}
        units={commonCryptoCurrencies}
        disabled
        description="This is a description"
      />,
    );
    expect(screen.getByText("This is a description")).toBeInTheDocument();
  });
});
