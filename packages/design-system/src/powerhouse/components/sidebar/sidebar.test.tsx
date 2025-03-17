import { render, screen } from "@testing-library/react";
import { it } from "vitest";
import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarPanel,
} from "./index.js";

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
