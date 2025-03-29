import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithForm } from "../../lib/testing.js";
import { Form } from "../form/index.js";
import { OIDField } from "./oid-field.js";

describe("OIDField Component", () => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.Element.prototype.scrollTo = vi.fn();
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query as string,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  const mockedOptions = [
    {
      icon: "Braces",
      title: "Object A",
      path: "rwa-portfolio-a",
      value: "baefc2a4-f9a0-4950-8161-fd8d8cc7dea7",
      description: "Object A description",
    },
    {
      icon: "Braces",
      title: "Object B",
      path: "rwa-portfolio-b",
      value: "baefc2a4-f9a0-4950-8161-fd8d8cc6cdb8",
      description: "Object B description",
    },
  ];

  const defaultGetOptions = vi.fn().mockResolvedValue(mockedOptions);
  const defaultGetSelectedOption = vi
    .fn()
    .mockImplementation((value: string) => {
      return mockedOptions.find((option) => option.value === value);
    });

  it("should match snapshot", () => {
    const { asFragment } = renderWithForm(
      <OIDField
        name="oid"
        label="OID Field"
        placeholder="uuid"
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("should render with label", () => {
    renderWithForm(
      <OIDField
        name="oid"
        label="Test Label"
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("should render with description", () => {
    renderWithForm(
      <OIDField
        name="oid"
        label="Test Label"
        description="Test Description"
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );
    expect(screen.getByText("Test Description")).toBeInTheDocument();
  });

  it("should handle disabled state", () => {
    renderWithForm(
      <OIDField
        name="oid"
        label="Test Label"
        disabled
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("should display error messages", async () => {
    renderWithForm(
      <OIDField
        name="oid"
        label="Test Label"
        errors={["Invalid OID format"]}
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Invalid OID format")).toBeInTheDocument(),
    );
  });

  it("should display warning messages", () => {
    renderWithForm(
      <OIDField
        name="oid"
        label="Test Label"
        warnings={["OID may be deprecated"]}
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );
    expect(screen.getByText("OID may be deprecated")).toBeInTheDocument();
  });

  it("should show autocomplete options", async () => {
    const user = userEvent.setup();
    const originalRandom = Math.random;
    Math.random = vi.fn().mockReturnValue(1);

    renderWithForm(
      <OIDField
        name="oid"
        label="Test Label"
        variant="withValueTitleAndDescription"
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.clear(input);
    await user.type(input, "test");

    await waitFor(() => {
      expect(defaultGetOptions).toHaveBeenCalledWith("test", {});
    });

    await waitFor(() => {
      expect(input).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText(mockedOptions[0].title)).toBeInTheDocument();
      expect(screen.getByText(mockedOptions[1].title)).toBeInTheDocument();
    });

    Math.random = originalRandom;
  });

  it("should have correct ARIA attributes", async () => {
    renderWithForm(
      <OIDField
        name="oid"
        label="Test Label"
        required
        errors={["Error message"]}
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );

    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-required", "true");
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("should show correct placeholders for different variants", () => {
    const { rerender } = renderWithForm(
      <OIDField
        name="oid"
        label="Test Label"
        variant="withValueTitleAndDescription"
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );

    expect(screen.getByText("Title not available")).toBeInTheDocument();
    expect(screen.getByText("Path not available")).toBeInTheDocument();
    expect(screen.getByText("Description not available")).toBeInTheDocument();

    rerender(
      <OIDField
        name="oid"
        label="Test Label"
        variant="withValueAndTitle"
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );

    expect(screen.getByText("Title not available")).toBeInTheDocument();
    expect(screen.getByText("Path not available")).toBeInTheDocument();
    expect(
      screen.queryByText("Description not available"),
    ).not.toBeInTheDocument();

    rerender(
      <OIDField
        name="oid"
        label="Test Label"
        variant="withValue"
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );

    expect(screen.queryByText("Title not available")).not.toBeInTheDocument();
    expect(screen.queryByText("Path not available")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Description not available"),
    ).not.toBeInTheDocument();
  });

  it("should handle autoComplete disabled", () => {
    renderWithForm(
      <OIDField name="oid" label="Test Label" autoComplete={false} />,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("should validate OID format on submit", async () => {
    const mockOnSubmit = vi.fn();
    const user = userEvent.setup();
    const validOID = mockedOptions[1].value;
    const invalidOID = "invalid-oid";

    render(
      <Form onSubmit={mockOnSubmit}>
        <OIDField
          name="oid"
          label="Test Label"
          fetchOptionsCallback={defaultGetOptions}
          fetchSelectedOptionCallback={defaultGetSelectedOption}
        />
        <button type="submit">Submit</button>
      </Form>,
    );

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.type(input, invalidOID);

    await user.click(screen.getByText("Submit"));
    await waitFor(() => {
      expect(mockOnSubmit).not.toHaveBeenCalled();
      expect(screen.getByText(/Invalid OID format/)).toBeInTheDocument();
    });

    await user.clear(input);
    await user.type(input, validOID);

    await user.click(screen.getByText("Submit"));
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        oid: validOID,
      });
    });
  });

  it("should handle value changes and auto selection", async () => {
    const user = userEvent.setup();
    const originalRandom = Math.random;
    Math.random = vi.fn().mockReturnValue(1);

    renderWithForm(
      <OIDField
        name="oid"
        label="Test Label"
        variant="withValueTitleAndDescription"
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.type(input, mockedOptions[0].value);

    await waitFor(() => {
      expect(input).toHaveAttribute("aria-expanded", "false");
    });

    await waitFor(() => {
      expect(screen.getByText(mockedOptions[0].title)).toBeInTheDocument();
      expect(screen.getByText(mockedOptions[0].path)).toBeInTheDocument();
      expect(
        screen.getByText(mockedOptions[0].description),
      ).toBeInTheDocument();
    });

    Math.random = originalRandom;
  });

  it("should not invoke onChange on mount when it has a defaultValue", () => {
    const onChange = vi.fn();
    renderWithForm(
      <OIDField
        name="oid"
        label="Test Label"
        defaultValue={mockedOptions[0].value}
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
        onChange={onChange}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
