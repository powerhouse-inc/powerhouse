import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithForm } from "@/scalars/lib/testing";
import { CountryCodeField } from "./country-code-field";

describe("CountryCodeField Component", () => {
  const defaultProps = {
    name: "country",
    label: "Select Country",
  };
  window.HTMLElement.prototype.scrollIntoView = () => {};

  it("should match snapshot", () => {
    const { asFragment } = renderWithForm(
      <CountryCodeField {...defaultProps} />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("should render with label", () => {
    renderWithForm(<CountryCodeField {...defaultProps} />);
    expect(screen.getByText("Select Country")).toBeInTheDocument();
  });

  it("should render with description", () => {
    renderWithForm(
      <CountryCodeField
        {...defaultProps}
        description="Please select your country"
      />,
    );
    expect(screen.getByText("Please select your country")).toBeInTheDocument();
  });

  it("should show required indicator when required prop is true", () => {
    renderWithForm(<CountryCodeField {...defaultProps} required />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("should disable the field when disabled prop is true", () => {
    renderWithForm(<CountryCodeField {...defaultProps} disabled />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("should display error messages", async () => {
    renderWithForm(
      <CountryCodeField {...defaultProps} errors={["Country is required"]} />,
    );
    await waitFor(() =>
      expect(screen.getByText("Country is required")).toBeInTheDocument(),
    );
  });

  it("should display warning messages", () => {
    renderWithForm(
      <CountryCodeField
        {...defaultProps}
        warnings={["Some countries may not be available"]}
      />,
    );
    expect(
      screen.getByText("Some countries may not be available"),
    ).toBeInTheDocument();
  });

  it("should handle value changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithForm(<CountryCodeField {...defaultProps} onChange={onChange} />);

    const select = screen.getByRole("button");
    await user.click(select);
    await user.click(screen.getByText("United States"));
    expect(onChange).toHaveBeenCalledWith("US");
  });

  it("should filter countries based on search when enableSearch is true", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <CountryCodeField
        {...defaultProps}
        enableSearch
        placeholder="Search..."
      />,
    );

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.type(input, "united");

    expect(screen.getByText("United States")).toBeInTheDocument();
    expect(screen.getByText("United Kingdom")).toBeInTheDocument();
    expect(screen.queryByText("France")).not.toBeInTheDocument();
    expect(screen.queryByText("Germany")).not.toBeInTheDocument();
  });

  it("should filter countries based on allowedCountries prop", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <CountryCodeField {...defaultProps} allowedCountries={["US", "GB"]} />,
    );

    const select = screen.getByRole("button");
    await user.click(select);

    expect(screen.getByText("United States")).toBeInTheDocument();
    expect(screen.getByText("United Kingdom")).toBeInTheDocument();
    expect(screen.queryByText("France")).not.toBeInTheDocument();
  });

  it("should filter out countries based on excludedCountries prop", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <CountryCodeField {...defaultProps} excludedCountries={["FR", "DE"]} />,
    );

    const select = screen.getByRole("button");
    await user.click(select);

    expect(screen.getByText("United States")).toBeInTheDocument();
    expect(screen.getByText("United Kingdom")).toBeInTheDocument();
    expect(screen.queryByText("France")).not.toBeInTheDocument();
    expect(screen.queryByText("Germany")).not.toBeInTheDocument();
  });

  it("should handle both allowedCountries and excludedCountries props", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <CountryCodeField
        {...defaultProps}
        allowedCountries={["US", "GB", "FR"]}
        excludedCountries={["FR"]}
      />,
    );

    const select = screen.getByRole("button");
    await user.click(select);

    expect(screen.getByText("United States")).toBeInTheDocument();
    expect(screen.getByText("United Kingdom")).toBeInTheDocument();
    expect(screen.queryByText("France")).not.toBeInTheDocument();
  });
});