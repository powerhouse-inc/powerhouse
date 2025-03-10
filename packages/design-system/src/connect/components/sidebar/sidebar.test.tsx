import { WagmiContext } from "#connect";
import {
  render,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import { it } from "vitest";
import { ConnectSidebar } from ".";

describe("Connect Sidebar Component", () => {
  it("should match snapshot", async () => {
    const { asFragment } = render(
      <WagmiContext>
        <ConnectSidebar
          address="0x123"
          data-testid="sidebar"
          onLogin={() => {}}
        />
      </WagmiContext>,
    );

    await waitForElementToBeRemoved(() =>
      screen.getAllByTestId("icon-fallback"),
    );

    expect(asFragment()).toMatchSnapshot();
  });

  it("should render correctly", () => {
    render(
      <WagmiContext>
        <ConnectSidebar
          address="0x123"
          data-testid="sidebar"
          onLogin={() => {}}
        />
      </WagmiContext>,
    );
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
  });
});
