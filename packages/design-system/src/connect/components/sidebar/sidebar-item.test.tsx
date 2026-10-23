import { render, screen } from "@testing-library/react";
import { Box } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { ConnectTooltipProvider } from "../tooltip/tooltip.js";
import { SidebarItem } from "./sidebar-item.js";

const inSidebar = (item: React.ReactNode) =>
  render(<ConnectTooltipProvider>{item}</ConnectTooltipProvider>);

describe("SidebarItem", () => {
  // The strip shows only an icon, so the name and description come from props.
  it("names a link by its title and describes it by its description", () => {
    inSidebar(
      <SidebarItem
        title="Inventory"
        description="Stock across warehouses"
        href="/inventory"
        icon={<Box />}
      />,
    );
    const link = screen.getByRole("link", { name: "Inventory" });
    expect(link.getAttribute("aria-description")).toBe(
      "Stock across warehouses",
    );
  });

  it("is a button when it only takes clicks, named without its fallback letter", () => {
    inSidebar(<SidebarItem title="Forecasts" onClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Forecasts" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.querySelector("[aria-hidden]")?.textContent).toBe("F");
  });
});
