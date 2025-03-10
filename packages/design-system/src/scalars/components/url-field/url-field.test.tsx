import { Form, renderWithForm } from "#scalars";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { UrlField } from "./url-field.js";

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

  it("should show error message when provided", async () => {
    renderWithForm(
      <UrlField
        name="test-url"
        label="Website URL"
        errors={["Invalid URL format"]}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Invalid URL format")).toBeInTheDocument(),
    );
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

    expect(
      await screen.findByText("not-a-url must be a valid URL"),
    ).toBeInTheDocument();
  });

  it("should be invalid if URL is to long", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <UrlField
        data-testid="url-field"
        name="test-url"
        label="Website URL"
        maxURLLength={10}
      />,
    );

    const input = screen.getByTestId("url-field");
    await user.type(input, "https://example.com/{enter}"); // 20 characters (including protocol and domain)

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(
      await screen.findByText("Website URL must not exceed 10 characters"),
    ).toBeInTheDocument();
  });

  it("should show warning when the URL could be truncated", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <UrlField data-testid="url-field" name="test-url" label="Website URL" />,
    );

    const input = screen.getByTestId("url-field");
    await user.type(input, "https://example.com/test...");
    await user.tab(); // trigger blur

    expect(await screen.findByText("URL may be truncated")).toBeInTheDocument();
  });

  it("should not show warnings if the prop is set false", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <UrlField
        data-testid="url-field"
        name="test-url"
        label="Website URL"
        showWarnings={false}
      />,
    );

    const input = screen.getByTestId("url-field");
    await user.type(input, "https://example.com/test...");
    await user.tab(); // trigger blur

    expect(screen.queryByText("URL may be truncated")).not.toBeInTheDocument();
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

  it("should render platform built-in icon when URL matches configured hostname", () => {
    renderWithForm(
      <UrlField
        data-testid="url-field"
        name="test-url"
        label="Website URL"
        value="https://github.com/test"
        platformIcons={{
          "github.com": "Github",
        }}
      />,
    );

    expect(screen.getByTestId("icon-fallback")).toBeInTheDocument();
  });

  it("should render a custom icon when hostname has no configured icon", () => {
    renderWithForm(
      <UrlField
        data-testid="url-field"
        name="test-url"
        label="Website URL"
        value="https://github.com/test"
        platformIcons={{
          "github.com": <span data-testid="custom-icon">Custom Icon</span>,
        }}
      />,
    );

    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("should not render any icon when platformIcons prop is not provided", () => {
    renderWithForm(
      <UrlField data-testid="url-field" name="test-url" label="Website URL" />,
    );

    expect(screen.queryByTestId("icon-fallback")).not.toBeInTheDocument();
  });

  it("should hide warnings when the form is reset", async () => {
    const user = userEvent.setup();
    render(
      <Form onSubmit={() => undefined} defaultValues={{ "test-url": "" }}>
        {({ reset }) => (
          <>
            <UrlField
              data-testid="url-field"
              name="test-url"
              label="Website URL"
            />
            <button type="reset" onClick={reset} data-testid="reset-button">
              Reset
            </button>
          </>
        )}
      </Form>,
    );

    // first show the warnings typing in the input
    await user.type(screen.getByTestId("url-field"), "https://x.com/test...");
    await user.tab(); // trigger blur
    expect(await screen.findByText("URL may be truncated")).toBeInTheDocument();

    // then hide the warnings when the form is reset
    await user.click(screen.getByTestId("reset-button"));
    expect(screen.queryByText("URL may be truncated")).toBeNull();
  });
});
