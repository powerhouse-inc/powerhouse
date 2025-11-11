import { render, screen } from "@testing-library/react";
import { it } from "vitest";
import { SidebarPanel } from "./sidebar-panel.js";
import { Sidebar, SidebarFooter, SidebarHeader } from "./sidebar.js";
describe("Sidebar Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(
      <Sidebar maxWidth="300px" minWidth="100px">
        <SidebarPanel>
          <SidebarHeader />
        </SidebarPanel>
        <SidebarFooter />
      </Sidebar>,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("should render correctly", () => {
    render(<Sidebar data-testid="sidebar" maxWidth="300px" minWidth="100px" />);
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
  });
});
