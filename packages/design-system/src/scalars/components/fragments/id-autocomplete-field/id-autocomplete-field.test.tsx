import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithForm } from "../../../lib/testing.js";
import { IdAutocompleteField } from "./id-autocomplete-field.js";

describe("IdAutocompleteField Component", () => {
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
      icon: "PowerhouseLogoSmall",
      title: "Document A",
      path: {
        text: "projects/finance/document-a",
      },
      value: "document-a",
      description: "Financial report for Q1 2024",
    },
    {
      icon: "PowerhouseLogoSmall",
      title: "Document B",
      path: {
        text: "projects/legal/document-b",
      },
      value: "document-b",
      description: "Legal compliance documentation",
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
      <IdAutocompleteField
        name="id-autocomplete"
        label="Id Autocomplete Field"
        placeholder="Search..."
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("should render with label", () => {
    renderWithForm(
      <IdAutocompleteField
        name="id-autocomplete"
        label="Test Label"
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("should render with description", () => {
    renderWithForm(
      <IdAutocompleteField
        name="id-autocomplete"
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
      <IdAutocompleteField
        name="id-autocomplete"
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
      <IdAutocompleteField
        name="id-autocomplete"
        label="Test Label"
        errors={["Invalid format"]}
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Invalid format")).toBeInTheDocument(),
    );
  });

  it("should display warning messages", () => {
    renderWithForm(
      <IdAutocompleteField
        name="id-autocomplete"
        label="Test Label"
        warnings={["Option may be deprecated"]}
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );
    expect(screen.getByText("Option may be deprecated")).toBeInTheDocument();
  });

  it("should show autocomplete options", async () => {
    const user = userEvent.setup();
    const originalRandom = Math.random;
    Math.random = vi.fn().mockReturnValue(1);

    renderWithForm(
      <IdAutocompleteField
        name="id-autocomplete"
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
      <IdAutocompleteField
        name="id-autocomplete"
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
      <IdAutocompleteField
        name="id-autocomplete"
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
      <IdAutocompleteField
        name="id-autocomplete"
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
      <IdAutocompleteField
        name="id-autocomplete"
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
      <IdAutocompleteField
        name="id-autocomplete"
        label="Test Label"
        autoComplete={false}
      />,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("should handle value changes and auto selection", async () => {
    const user = userEvent.setup();
    const originalRandom = Math.random;
    Math.random = vi.fn().mockReturnValue(1);

    renderWithForm(
      <IdAutocompleteField
        name="id-autocomplete"
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
      expect(screen.getByText(mockedOptions[0].path.text)).toBeInTheDocument();
      expect(
        screen.getByText(mockedOptions[0].description),
      ).toBeInTheDocument();
    });

    Math.random = originalRandom;
  });

  it("should not invoke onChange on mount when it has a defaultValue", () => {
    const onChange = vi.fn();
    renderWithForm(
      <IdAutocompleteField
        name="id-autocomplete"
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
