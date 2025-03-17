import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs.js";

describe("Tabs Components", () => {
  it("should  Tabs match snapshot", () => {
    const { asFragment } = render(<Tabs />);
    expect(asFragment()).toMatchSnapshot();
  });
  it("should  TabsList match snapshot", () => {
    const { asFragment } = render(
      <Tabs>
        <TabsList />
      </Tabs>,
    );
    expect(asFragment()).toMatchSnapshot();
  });
  it("should TabsContent  match snapshot", () => {
    const { asFragment } = render(
      <Tabs>
        <TabsContent value="tab1">Content 1</TabsContent>
      </Tabs>,
    );
    expect(asFragment()).toMatchSnapshot();
  });
  it("should TabsTrigger match snapshot", () => {
    const { asFragment } = render(
      <Tabs>
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(asFragment()).toMatchSnapshot();
  });
  it("renders basic tabs structure", () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByText("Content 1")).toBeInTheDocument();
  });

  it("activates when selected", async () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const firstTab = screen.getAllByRole("tab")[0];
    expect(firstTab).toHaveAttribute("data-state", "active");
    await userEvent.click(screen.getByText("Tab 2"));
    expect(screen.getByText("Tab 2")).toHaveAttribute("data-state", "active");
  });

  it("shows content when associated tab is active", async () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1" data-testid="content-1">
          Content 1
        </TabsContent>
        <TabsContent value="tab2" data-testid="content-2">
          Content 2
        </TabsContent>
      </Tabs>,
    );

    // Check initial state
    expect(screen.getByTestId("content-1")).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByTestId("content-2")).toHaveAttribute(
      "data-state",
      "inactive",
    );

    // Switch tabs
    await userEvent.click(screen.getByText("Tab 2"));

    // Verify updated state
    expect(screen.getByTestId("content-1")).toHaveAttribute(
      "data-state",
      "inactive",
    );
    expect(screen.getByTestId("content-2")).toHaveAttribute(
      "data-state",
      "active",
    );
  });
});
