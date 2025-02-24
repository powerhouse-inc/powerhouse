import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithForm } from "@/scalars/lib/testing";
import { Form } from "@/scalars/components/form";
import { AIDField } from "./aid-field";

describe("AIDField Component", () => {
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
      icon: "Person",
      title: "Agent A",
      path: "agents/agent-a",
      value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a",
      description: "Agent A description",
    },
    {
      icon: "Person",
      title: "Agent B",
      path: "agents/agent-b",
      value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936e8a",
      description: "Agent B description",
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
      <AIDField
        name="aid"
        label="AID Field"
        placeholder="did:ethr:"
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("should render with label", () => {
    renderWithForm(
      <AIDField
        name="aid"
        label="Test Label"
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("should render with description", () => {
    renderWithForm(
      <AIDField
        name="aid"
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
      <AIDField
        name="aid"
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
      <AIDField
        name="aid"
        label="Test Label"
        errors={["Invalid AID format"]}
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Invalid AID format")).toBeInTheDocument(),
    );
  });

  it("should display warning messages", () => {
    renderWithForm(
      <AIDField
        name="aid"
        label="Test Label"
        warnings={["AID may be deprecated"]}
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );
    expect(screen.getByText("AID may be deprecated")).toBeInTheDocument();
  });

  it("should show autocomplete options", async () => {
    const user = userEvent.setup();
    const originalRandom = Math.random;
    Math.random = vi.fn().mockReturnValue(1);

    renderWithForm(
      <AIDField
        name="aid"
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
      expect(defaultGetOptions).toHaveBeenCalledWith("test");
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
      <AIDField
        name="aid"
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
      <AIDField
        name="aid"
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
      <AIDField
        name="aid"
        label="Test Label"
        variant="withValueAndTitle"
        fetchOptionsCallback={defaultGetOptions}
        fetchSelectedOptionCallback={defaultGetSelectedOption}
      />,
    );

    expect(screen.getByText("Title not available")).toBeInTheDocument();
    expect(screen.queryByText("Path not available")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Description not available"),
    ).not.toBeInTheDocument();

    rerender(
      <AIDField
        name="aid"
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
      <AIDField name="aid" label="Test Label" autoComplete={false} />,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("should validate AID format on submit", async () => {
    const mockOnSubmit = vi.fn();
    const user = userEvent.setup();
    const validAid = mockedOptions[1].value;
    const invalidAid = "invalid-aid";

    render(
      <Form onSubmit={mockOnSubmit}>
        <AIDField
          name="aid"
          label="Test Label"
          supportedNetworks={[
            {
              chainId: "0x5",
              name: "Goerli",
            },
          ]}
          fetchOptionsCallback={defaultGetOptions}
          fetchSelectedOptionCallback={defaultGetSelectedOption}
        />
        <button type="submit">Submit</button>
      </Form>,
    );

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.type(input, invalidAid);

    await user.click(screen.getByText("Submit"));
    await waitFor(() => {
      expect(mockOnSubmit).not.toHaveBeenCalled();
      expect(screen.getByText(/Invalid DID format/)).toBeInTheDocument();
    });

    await user.clear(input);
    await user.type(input, validAid);

    await user.click(screen.getByText("Submit"));
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        aid: validAid,
      });
    });
  });

  it("should handle value changes and auto selection", async () => {
    const user = userEvent.setup();
    const originalRandom = Math.random;
    Math.random = vi.fn().mockReturnValue(1);

    renderWithForm(
      <AIDField
        name="aid"
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
      <AIDField
        name="aid"
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
