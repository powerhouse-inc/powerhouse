import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithForm } from "@/scalars/lib/testing";
import { CurrencyCodeField } from "./currency-code-field";
import { Form } from "../form";

describe("CurrencyCodeField", () => {
  it("should match snapshot", () => {
    const { container } = renderWithForm(
      <CurrencyCodeField
        name="currency"
        label="Currency"
        description="Select a currency"
        value="USD"
      />,
    );
    expect(container).toMatchSnapshot();
  });

  it("should render with default props", () => {
    renderWithForm(<CurrencyCodeField name="currency" label="Currency" />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("Currency")).toBeInTheDocument();
  });

  it("should show an error if trying to submit empty with required enabled", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <>
        <CurrencyCodeField name="currency" label="Currency" required />
        <button type="submit">Submit</button>
      </>,
    );
    await user.click(screen.getByText("Submit"));
    expect(screen.getByText("This field is required")).toBeInTheDocument();
  });

  it("should submit the currency code", async () => {
    const onSubmit = vitest.fn();
    const user = userEvent.setup();
    render(
      <Form onSubmit={onSubmit}>
        <CurrencyCodeField name="currency" label="Currency" value="USD" />
        <button type="submit">Submit</button>
      </Form>,
    );
    await user.click(screen.getByText("Submit"));
    expect(onSubmit).toHaveBeenCalledWith({ currency: "USD" });
  });

  it("should allow to submit multiple currencies at once", async () => {
    const onSubmit = vitest.fn();
    const user = userEvent.setup();
    render(
      <Form onSubmit={onSubmit}>
        <CurrencyCodeField name="currency" label="Currency" multiple />
        <button type="submit">Submit</button>
      </Form>,
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("United States Dollar"));
    await user.click(screen.getByText("Euro"));
    await user.click(screen.getByText("Submit"));
    expect(onSubmit).toHaveBeenCalledWith({ currency: ["USD", "EUR"] });
  });

  it("should handle disabled state", () => {
    renderWithForm(
      <CurrencyCodeField name="currency" label="Currency" disabled />,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("should filter currencies based on allowedCurrencies prop", async () => {
    const allowedCurrencies = ["USD", "EUR"];
    const user = userEvent.setup();
    renderWithForm(
      <CurrencyCodeField
        name="currency"
        label="Currency"
        allowedCurrencies={allowedCurrencies}
      />,
    );

    await user.click(await screen.findByRole("combobox"));

    // Should show allowed currencies
    expect(screen.getByText("United States Dollar")).toBeInTheDocument();
    expect(screen.getByText("Euro")).toBeInTheDocument();

    // Should not show other currencies
    expect(screen.queryByText("British Pound")).not.toBeInTheDocument();
  });

  it("should filter currencies based on excludedCurrencies prop", async () => {
    const excludedCurrencies = ["USD", "EUR"];
    const user = userEvent.setup();
    renderWithForm(
      <CurrencyCodeField
        name="currency"
        label="Currency"
        excludedCurrencies={excludedCurrencies}
      />,
    );

    await user.click(await screen.findByRole("combobox"));

    // Should not show excluded currencies
    expect(screen.queryByText("United States Dollar")).not.toBeInTheDocument();
    expect(screen.queryByText("Euro")).not.toBeInTheDocument();

    // Should show other currencies
    expect(screen.getByText("British Pound")).toBeInTheDocument();
  });

  it("should display custom errors", async () => {
    const errors = ["Please select a valid currency"];
    renderWithForm(
      <CurrencyCodeField name="currency" label="Currency" errors={errors} />,
    );
    expect(await screen.findByText(errors[0])).toBeInTheDocument();
  });

  it("should display custom warnings", async () => {
    const warnings = ["This currency may have restrictions"];
    renderWithForm(
      <CurrencyCodeField
        name="currency"
        label="Currency"
        warnings={warnings}
      />,
    );
    expect(await screen.findByText(warnings[0])).toBeInTheDocument();
  });

  it("should call onChange when selection changes", async () => {
    const handleChange = vitest.fn();
    const user = userEvent.setup();
    renderWithForm(
      <CurrencyCodeField
        name="currency"
        label="Currency"
        onChange={handleChange}
      />,
    );

    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByText("United States Dollar"));

    expect(handleChange).toHaveBeenCalledWith("USD");
  });

  it("should call onBlur when the field is blurred", async () => {
    const handleBlur = vitest.fn();
    const user = userEvent.setup();
    renderWithForm(
      <CurrencyCodeField
        name="currency"
        label="Currency"
        onBlur={handleBlur}
      />,
    );
    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByText("United States Dollar"));

    expect(handleBlur).toHaveBeenCalled();
  });
});
