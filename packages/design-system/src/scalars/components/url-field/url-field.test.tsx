import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UrlField } from "./url-field";
import { renderWithForm } from "@/scalars/lib/testing";

describe("UrlField", () => {
  it("should match snapshot", () => {
    const { container } = renderWithForm(
      <UrlField
        name="test-url"
        label="Website URL"
        description="Enter your website URL"
        placeholder="https://example.com"
        required
        warnings={["URL may be unreachable"]}
        errors={["Invalid URL format"]}
      />,
    );

    expect(container).toMatchSnapshot();
  });

  it("should render with basic props", () => {
    renderWithForm(
      <UrlField
        data-testid="url-field"
        name="test-url"
        label="Website URL"
        placeholder="https://example.com"
      />,
    );

    expect(screen.getByTestId("url-field")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("https://example.com"),
    ).toBeInTheDocument();
  });

  it("should show required indicator when required", () => {
    renderWithForm(
      <UrlField
        data-testid="url-field"
        name="test-url"
        label="Website URL"
        required
      />,
    );

    expect(screen.getByText("*")).toBeInTheDocument();
    expect(screen.getByTestId("url-field")).toHaveAttribute("required");
  });

  it("should show description when provided", () => {
    renderWithForm(
      <UrlField
        name="test-url"
        label="Website URL"
        description="Enter your website URL"
      />,
    );

    expect(screen.getByText("Enter your website URL")).toBeInTheDocument();
  });

  it("should show error message when provided", () => {
    renderWithForm(
      <UrlField
        name="test-url"
        label="Website URL"
        errors={["Invalid URL format"]}
      />,
    );

    expect(screen.getByText("Invalid URL format")).toBeInTheDocument();
  });

  it("should show warning message when provided", () => {
    renderWithForm(
      <UrlField
        name="test-url"
        label="Website URL"
        warnings={["URL may be unreachable"]}
      />,
    );

    expect(screen.getByText("URL may be unreachable")).toBeInTheDocument();
  });

  it("should be disabled when disabled prop is true", () => {
    renderWithForm(
      <UrlField
        data-testid="url-field"
        name="test-url"
        label="Website URL"
        disabled
      />,
    );

    expect(screen.getByTestId("url-field")).toBeDisabled();
  });

  it("should validate URL format", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <>
        <UrlField data-testid="url-field" name="test-url" label="Website URL" />
        <button type="submit">Submit</button>
      </>,
    );

    const input = screen.getByTestId("url-field");
    await user.type(input, "not-a-url{enter}");

    expect(await screen.findByText("Invalid URL")).toBeInTheDocument();
  });

  it("should be valid when valid", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithForm(
      <>
        <UrlField data-testid="url-field" name="test-url" label="Website URL" />
        <button type="submit">Submit</button>
      </>,
      onSubmit,
    );

    const input = screen.getByTestId("url-field");
    await user.type(input, "https://example.com{enter}");
    expect(onSubmit).toHaveBeenCalled();
  });
});
