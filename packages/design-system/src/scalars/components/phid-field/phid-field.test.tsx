import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithForm } from "@/scalars/lib/testing";
import { PHIDField } from "./phid-field";
import { fetchPHIDOptions, fetchSelectedOption } from "./utils";
import { Form } from "@/scalars/components/form";

vi.mock("./utils", () => ({
  fetchPHIDOptions: vi.fn(),
  fetchSelectedOption: vi.fn(),
}));

describe("PHIDField Component", () => {
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

  const mockOptions = [
    {
      title: "Document A",
      path: "projects/finance/document-a",
      phid: "phd:baefc2a4-f9a0-4950-8161-fd8d8cc7dea7:main:public",
      description: "Financial report for Q1 2024",
    },
    {
      title: "Document B",
      path: "projects/legal/document-b",
      phid: "phd:baefc2a4-f9a0-4950-8161-fd8d8cc6cdb8:main:public",
      description: "Legal compliance documentation",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should match snapshot", () => {
    const { asFragment } = renderWithForm(
      <PHIDField name="phid" label="PHID Field" placeholder="phd:" />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("should render with label", () => {
    renderWithForm(<PHIDField name="phid" label="Test Label" />);
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("should render with description", () => {
    renderWithForm(
      <PHIDField
        name="phid"
        label="Test Label"
        description="Test Description"
      />,
    );
    expect(screen.getByText("Test Description")).toBeInTheDocument();
  });

  it("should handle disabled state", () => {
    renderWithForm(<PHIDField name="phid" label="Test Label" disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("should display error messages", async () => {
    renderWithForm(
      <PHIDField
        name="phid"
        label="Test Label"
        errors={["Invalid PHID format"]}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Invalid PHID format")).toBeInTheDocument(),
    );
  });

  it("should display warning messages", () => {
    renderWithForm(
      <PHIDField
        name="phid"
        label="Test Label"
        warnings={["PHID may be deprecated"]}
      />,
    );
    expect(screen.getByText("PHID may be deprecated")).toBeInTheDocument();
  });

  it("should show autocomplete options", async () => {
    const user = userEvent.setup();
    const mockPromise = Promise.resolve(mockOptions);
    (fetchPHIDOptions as jest.Mock).mockReturnValue(mockPromise);

    const originalRandom = Math.random;
    Math.random = vi.fn().mockReturnValue(1);

    renderWithForm(
      <PHIDField
        name="phid"
        label="Test Label"
        placeholder="phd:"
        variant="withIdAndTitle"
      />,
    );

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.type(input, "test");

    await waitFor(() => {
      expect(fetchPHIDOptions).toHaveBeenCalledWith({
        phidFragment: "test",
        allowedScopes: undefined,
        allowedDocumentTypes: undefined,
        defaultBranch: "main",
        defaultScope: "public",
        signal: expect.any(AbortSignal) as AbortSignal,
      });
    });

    await mockPromise;

    await waitFor(() => {
      expect(input).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText(mockOptions[0].title)).toBeInTheDocument();
      expect(screen.getByText(mockOptions[1].title)).toBeInTheDocument();
    });

    Math.random = originalRandom;
  });

  it("should have correct ARIA attributes", async () => {
    renderWithForm(
      <PHIDField
        name="phid"
        label="Test Label"
        required
        errors={["Error message"]}
      />,
    );

    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-required", "true");
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("should show correct placeholders for different variants", () => {
    const { rerender } = renderWithForm(
      <PHIDField name="phid" label="Test Label" variant="withIdAndTitle" />,
    );

    expect(screen.getByText("Title Unavailable")).toBeInTheDocument();

    rerender(
      <PHIDField
        name="phid"
        label="Test Label"
        variant="withIdTitleAndDescription"
      />,
    );

    expect(screen.getByText("Title Unavailable")).toBeInTheDocument();
    expect(screen.getByText("aha/hah-lorem")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Lorem ipsum dolor sit amet consectetur. Sed elementum tempor.",
      ),
    ).toBeInTheDocument();
  });

  it("should handle autoComplete disabled", async () => {
    const user = userEvent.setup();

    renderWithForm(
      <PHIDField name="phid" label="Test Label" autoComplete={false} />,
    );

    const input = screen.getByRole("textbox");
    await user.type(input, "test");

    expect(fetchPHIDOptions).not.toHaveBeenCalled();
  });

  it("should validate PHID format on submit", async () => {
    const mockOnSubmit = vi.fn();
    const user = userEvent.setup();
    const validPhid = mockOptions[0].phid;
    const invalidPhid = "invalid-phid";

    render(
      <Form onSubmit={mockOnSubmit}>
        <PHIDField name="phid" label="Test Label" />
        <button type="submit">Submit</button>
      </Form>,
    );

    const input = screen.getByRole("combobox");

    await user.type(input, invalidPhid);
    await user.click(screen.getByText("Submit"));
    expect(mockOnSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Invalid format/)).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, validPhid);
    await user.click(screen.getByText("Submit"));
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        phid: validPhid,
      });
    });
  });

  it("should handle value changes and auto selection", async () => {
    const onChangeMock = vi.fn();
    const user = userEvent.setup();
    const mockSelectedOption = mockOptions[0];
    const mockPhid = mockSelectedOption.phid;

    const originalRandom = Math.random;
    Math.random = vi.fn().mockReturnValue(1);

    (fetchPHIDOptions as jest.Mock).mockResolvedValue(mockOptions);
    const mockPromise = Promise.resolve(mockSelectedOption);
    (fetchSelectedOption as jest.Mock).mockReturnValue(mockPromise);

    renderWithForm(
      <PHIDField
        name="phid"
        label="Test Label"
        onChange={onChangeMock}
        variant="withIdTitleAndDescription"
      />,
    );

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.type(input, "phd:");

    await waitFor(() => {
      expect(input).toHaveAttribute("aria-expanded", "true");
      expect(fetchPHIDOptions).toHaveBeenCalled();
    });

    await user.type(input, mockPhid.slice(4));

    await mockPromise;
    await waitFor(() => {
      expect(input).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByText(mockSelectedOption.title)).toBeInTheDocument();
      expect(screen.getByText(mockSelectedOption.path)).toBeInTheDocument();
      expect(
        screen.getByText(mockSelectedOption.description),
      ).toBeInTheDocument();
    });

    Math.random = originalRandom;
  });
});
