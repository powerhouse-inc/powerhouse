import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { describe, expect, it } from "vitest";
import { Tooltip, TooltipProvider } from "@powerhousedao/design-system";

const TooltipTest = ({
  content = "Test tooltip" as React.ReactNode,
  children = "Hover me" as React.ReactNode,
  ...props
}) => (
  <TooltipProvider>
    <Tooltip content={content} {...props}>
      {children}
    </Tooltip>
  </TooltipProvider>
);

describe("Tooltip", () => {
  it("should render trigger element", () => {
    render(<TooltipTest />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("should show tooltip on hover", async () => {
    const onOpenChange = vi.fn();
    render(<TooltipTest onOpenChange={onOpenChange} />);

    const trigger = screen.getByText("Hover me");
    const user = userEvent.setup();
    await user.hover(trigger);

    // Wait for the tooltip to be visible by role
    const tooltip = await waitFor(() => screen.getAllByText("Test tooltip"));
    expect(tooltip[0]).toBeInTheDocument();
  });

  it("should hide tooltip when mouse leaves", async () => {
    render(<TooltipTest />);

    const trigger = screen.getByRole("button");
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);

    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });

  it("should render with custom content", () => {
    render(<TooltipTest content={<div>Custom tooltip</div>} open={true} />);

    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("should render with custom trigger element", () => {
    render(
      <TooltipTest>
        <span>Custom trigger</span>
      </TooltipTest>,
    );

    expect(screen.getByText("Custom trigger")).toBeInTheDocument();
  });

  it("should be controlled with open prop", () => {
    render(<TooltipTest open={true} />);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("should apply custom className to tooltip content", () => {
    // custom class for testing purposes

    render(<TooltipTest className="custom-class" open={true} />);
    const tooltip = screen.getAllByText("Test tooltip");
    expect(tooltip[0]).toHaveClass("custom-class");
  });

  it("should render with different alignments", () => {
    render(<TooltipTest align="start" open={true} />);
    const tooltip = screen.getAllByText("Test tooltip");
    expect(tooltip[0]).toHaveAttribute("data-align", "start");
  });

  it("should render on different sides", () => {
    render(<TooltipTest side="right" open={true} />);
    const tooltip = screen.getAllByText("Test tooltip");
    expect(tooltip[0]).toHaveAttribute("data-side", "right");
  });
});
