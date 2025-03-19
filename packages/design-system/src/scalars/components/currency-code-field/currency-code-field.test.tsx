import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithForm } from "../../lib/testing.js";
import { Form } from "../form/index.js";
import { CurrencyCodeField } from "./currency-code-field.js";

describe("CurrencyCodeField", () => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();

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

  it("should handle disabled state", () => {
    renderWithForm(
      <CurrencyCodeField name="currency" label="Currency" disabled />,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
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
});
