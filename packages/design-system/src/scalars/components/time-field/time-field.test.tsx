import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { vi } from "vitest";
import { renderWithForm } from "../../lib/testing.js";

import { TimeField } from "./time-field.js";
vi.mock("#powerhouse", () => ({
  Icon: ({ name, className }: { name: string; className?: string }) => (
    <div data-testid={`mock-icon-${name}`} className={className}>
      Mock Icon: {name}
    </div>
  ),
}));

describe("TimePickerField", () => {
  it("should match the snapshot", () => {
    const { container } = renderWithForm(
      <TimeField
        label="Test Label"
        name="test-time"
        id="test-id"
        required
        disabled={false}
      />,
    );
    expect(container).toMatchSnapshot();
  });

  it("should display the label when provided", () => {
    const labelText = "Test Label";
    renderWithForm(<TimeField name="test-time" label={labelText} />);
    expect(screen.getByText(labelText)).toBeInTheDocument();
  });

  it("should not render the label when label prop is not provided", () => {
    renderWithForm(<TimeField name="test-time" />);
    expect(screen.queryByText("Test Label")).not.toBeInTheDocument();
  });

  it("should mark the label as required when required prop is true", () => {
    renderWithForm(<TimeField name="test-time" label="Test Label" required />);
    const label = screen.getByText("Test Label");
    const asterisk = screen.getByText("*");
    expect(label).toBeInTheDocument();
    expect(asterisk).toBeInTheDocument();
  });

  it("should mark the label as disabled when disabled prop is true", () => {
    renderWithForm(<TimeField name="test-time" label="Test Label" disabled />);
    const label = screen.getByText("Test Label");
    expect(label).toHaveClass("cursor-not-allowed");
    expect(label).toHaveClass("text-gray-700");
  });

  it("should handle timeIntervals prop correctly with 15-minute intervals", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <TimeField name="test-time" label="Test Label" timeIntervals={15} />,
    );
    // Open the time picker using the button instead of the input
    const clockButton = screen.getByRole("button");
    await user.click(clockButton);

    // First wait for the popover to be visible
    const popoverContent = await screen.findByRole("dialog");
    expect(popoverContent).toBeVisible();

    // Now check for the minute values
    const minutes = ["00", "15", "30", "45"];
    for (const minute of minutes) {
      // Use findAllByText instead of findByText since there are multiple elements with the same text
      const minuteElements = await screen.findAllByText(minute);
      expect(minuteElements.length).toBeGreaterThan(0);
      expect(minuteElements[0]).toBeInTheDocument();
    }

    // Verify that intermediate values are not present
    ["13", "20", "25", "35", "40", "50", "55"].forEach((minute) => {
      expect(screen.queryByText(minute)).not.toBeInTheDocument();
    });
  });

  it("should handle timeIntervals prop correctly with 30-minute intervals", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <TimeField name="test-time" label="Test Label" timeIntervals={30} />,
    );

    // Open the time picker using the button instead of the input
    const clockButton = screen.getByRole("button");
    await user.click(clockButton);

    // First wait for the popover to be visible
    const popoverContent = await screen.findByRole("dialog");
    expect(popoverContent).toBeVisible();

    // Now check for the minute values
    const minutes = ["00", "30"];
    for (const minute of minutes) {
      const minuteElements = await screen.findAllByText(minute);
      expect(minuteElements.length).toBeGreaterThan(0);
      expect(minuteElements[0]).toBeInTheDocument();
    }
    // Verify that other values are not present
    ["15", "45"].forEach((minute) => {
      expect(screen.queryByText(minute)).not.toBeInTheDocument();
    });
  });

  it("should set timezone value and disable select when timeZone prop is provided", async () => {
    const user = userEvent.setup();
    const timeZoneValue = "America/New_York";

    renderWithForm(
      <TimeField
        name="test-time"
        label="Test Label"
        timeZone={timeZoneValue}
      />,
    );

    const clockButton = screen.getByRole("button");
    await user.click(clockButton);

    const popoverContent = await screen.findByRole("dialog");
    expect(popoverContent).toBeVisible();

    const select = await screen.findByRole("combobox");
    expect(select).toBeDisabled();

    // Use a more flexible approach to find the timezone text
    const timezoneText = screen.getByText((content) => {
      return content.includes("New York") && content.includes("(");
    });
    expect(timezoneText).toBeInTheDocument();
  });

  it("should display continent when includeContinent prop is true", async () => {
    const user = userEvent.setup();
    const timeZoneValue = "America/New_York";

    renderWithForm(
      <TimeField
        name="test-time"
        label="Test Label"
        timeZone={timeZoneValue}
        includeContinent
      />,
    );

    const clockButton = screen.getByRole("button");
    await user.click(clockButton);

    const popoverContent = await screen.findByRole("dialog");
    expect(popoverContent).toBeVisible();

    // Verify that the timezone includes the continent (America)
    const timezoneText = screen.getByText((content) => {
      return content.includes("America") && content.includes("New York");
    });
    expect(timezoneText).toBeInTheDocument();
  });

  it("should not display continent when includeContinent prop is false", async () => {
    const user = userEvent.setup();
    const timeZoneValue = "America/New_York";

    renderWithForm(
      <TimeField
        name="test-time"
        label="Test Label"
        timeZone={timeZoneValue}
        includeContinent={false}
      />,
    );

    const clockButton = screen.getByRole("button");
    await user.click(clockButton);

    const popoverContent = await screen.findByRole("dialog");
    expect(popoverContent).toBeVisible();

    // Verify that the timezone excludes the continent (America)
    const timezoneText = screen.getByText((content) => {
      return content.includes("New York") && !content.includes("America");
    });
    expect(timezoneText).toBeInTheDocument();
  });
});
