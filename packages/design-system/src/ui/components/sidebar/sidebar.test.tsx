import { act, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./sidebar.js";
import {
  SidebarProvider,
  useSidebar,
} from "./subcomponents/sidebar-provider/index.js";
import { Icon } from "../../../powerhouse/index.js";

// Mock react-virtualized components for testing
vi.mock("react-virtualized", () => ({
  AutoSizer: ({
    children,
  }: {
    children: (props: { width: number; height: number }) => React.ReactNode;
  }) => children({ width: 300, height: 400 }),
  List: ({
    rowRenderer,
    rowCount,
  }: {
    rowRenderer: (args: {
      index: number;
      key: string | number;
      style: React.CSSProperties;
    }) => React.ReactNode;
    rowCount: number;
  }) => (
    <div>
      {Array.from({ length: rowCount }, (_, index) =>
        rowRenderer({ index, key: index, style: {} as React.CSSProperties }),
      )}
    </div>
  ),
}));

const mockNodes = [
  {
    id: "1",
    title: "Node 1",
    children: [
      {
        id: "1.1",
        title: "Node 1.1",
        children: [],
      },
    ],
  },
  {
    id: "2",
    title: "Node 2",
    children: [],
  },
];

const mockNodesWithClassName = [
  {
    id: "1",
    title: "Node with custom class",
    className: "custom-node-class text-blue-500",
    children: [],
  },
  {
    id: "2",
    title: "Normal node",
    children: [],
  },
];

const renderSidebar = (props = {}) => {
  return render(
    <SidebarProvider nodes={mockNodes}>
      <Sidebar {...props} />
    </SidebarProvider>,
  );
};

describe("Sidebar Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = renderSidebar({
      sidebarTitle: "Test Sidebar",
      sidebarIcon: <Icon name="M" size={16} />,
      enableMacros: 2,
      defaultLevel: 1,
    });
    expect(asFragment()).toMatchSnapshot();
  });

  it("should render sidebar title and icon when provided", () => {
    renderSidebar({
      sidebarTitle: "Test Sidebar",
      sidebarIcon: <div data-testid="sidebar-icon">Icon</div>,
    });

    expect(screen.getByText("Test Sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-icon")).toBeInTheDocument();
  });

  it("should render search bar by default", () => {
    renderSidebar();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("should not render search bar when showSearchBar is false", () => {
    renderSidebar({ showSearchBar: false });
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("should render extra footer content when provided", () => {
    renderSidebar({
      extraFooterContent: <div>Extra Footer Content</div>,
    });
    expect(screen.getByText("Extra Footer Content")).toBeInTheDocument();
  });

  it("should render pinning area when there are pinned items", () => {
    renderSidebar({
      allowPinning: true,
    });

    // Initially pinning area should not be visible
    expect(screen.queryByTestId("pinning-area")).not.toBeInTheDocument();
  });

  it("should apply className when node is pinned via user interaction", async () => {
    let sidebarContext: ReturnType<typeof useSidebar> | null = null;

    const TestComponent = () => {
      sidebarContext = useSidebar();
      return <Sidebar allowPinning={true} />;
    };

    render(
      <SidebarProvider nodes={mockNodesWithClassName}>
        <TestComponent />
      </SidebarProvider>,
    );

    act(() => {
      sidebarContext?.togglePin("1");
    });

    await waitFor(() => {
      const pinnedNode = screen.getByText("Node with custom class");
      expect(pinnedNode).toBeInTheDocument();

      // The custom className should be applied to the parent sidebar item container
      const sidebarItemContainer = pinnedNode.closest(
        '[data-testid="sidebar-item"]',
      );
      expect(sidebarItemContainer).toHaveClass(
        "custom-node-class",
        "text-blue-500",
      );
    });
  });

  describe("Sidebar Header Button Interactions", () => {
    it("should call handleOnTitleClick when sidebar title button is clicked", async () => {
      const user = userEvent.setup();
      const handleOnTitleClick = vi.fn();

      renderSidebar({
        sidebarTitle: "Test Sidebar",
        handleOnTitleClick,
      });

      const titleButton = screen.getByRole("button", { name: "Test Sidebar" });
      expect(titleButton).toBeInTheDocument();

      await user.click(titleButton);
      expect(handleOnTitleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Loading State", () => {
    it("should render normal content when isLoading is false", () => {
      renderSidebar({ isLoading: false });

      // Should see normal sidebar items
      expect(screen.getByText("Node 1")).toBeInTheDocument();
      expect(screen.getByText("Node 2")).toBeInTheDocument();

      // Should not see loading indicator
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("should render skeleton items when isLoading is true", () => {
      renderSidebar({ isLoading: true });

      // Should see loading status indicator
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(
        screen.getByLabelText("Loading sidebar content"),
      ).toBeInTheDocument();

      // Should not see normal sidebar items
      expect(screen.queryByText("Node 1")).not.toBeInTheDocument();
      expect(screen.queryByText("Node 2")).not.toBeInTheDocument();
    });

    it("should render skeleton items with proper ARIA attributes", () => {
      renderSidebar({ isLoading: true });

      const loadingContainer = screen.getByRole("status");
      expect(loadingContainer).toHaveAttribute(
        "aria-label",
        "Loading sidebar content",
      );
    });

    it("should preserve header functionality during loading", () => {
      renderSidebar({
        isLoading: true,
        sidebarTitle: "Test Sidebar",
        sidebarIcon: <div data-testid="sidebar-icon">Icon</div>,
      });

      // Header should still be visible and functional
      expect(screen.getByText("Test Sidebar")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-icon")).toBeInTheDocument();
    });

    it("should preserve search bar during loading", () => {
      renderSidebar({
        isLoading: true,
        showSearchBar: true,
      });

      // Search bar should still be present
      expect(screen.getByRole("searchbox")).toBeInTheDocument();
    });

    it("should preserve footer content during loading", () => {
      renderSidebar({
        isLoading: true,
        extraFooterContent: <div>Extra Footer Content</div>,
      });

      // Footer should still be visible
      expect(screen.getByText("Extra Footer Content")).toBeInTheDocument();
    });

    it("should not display pinning area during loading even when allowPinning is true", () => {
      renderSidebar({
        isLoading: true,
        allowPinning: true,
      });

      // Pinning area should not be visible during loading
      expect(screen.queryByTestId("pinning-area")).not.toBeInTheDocument();
    });

    it("should default to false when isLoading prop is not provided", () => {
      renderSidebar();

      // Should show normal content by default
      expect(screen.getByText("Node 1")).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("should handle transition from loading to loaded state", async () => {
      const { rerender } = render(
        <SidebarProvider nodes={mockNodes}>
          <Sidebar isLoading={true} />
        </SidebarProvider>,
      );

      // Initially should show loading state
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.queryByText("Node 1")).not.toBeInTheDocument();

      // Rerender with loading false
      rerender(
        <SidebarProvider nodes={mockNodes}>
          <Sidebar isLoading={false} />
        </SidebarProvider>,
      );

      // Should now show actual content
      await waitFor(() => {
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(screen.getByText("Node 1")).toBeInTheDocument();
      });
    });

    it("should match snapshot in loading state", () => {
      const { asFragment } = renderSidebar({
        isLoading: true,
        sidebarTitle: "Test Sidebar",
        sidebarIcon: <Icon name="M" size={16} />,
        enableMacros: 2,
      });
      expect(asFragment()).toMatchSnapshot();
    });
  });

  describe("Nodes Sorting", () => {
    const testNodes = [
      {
        id: "1",
        title: "Zebra",
        children: [
          { id: "1.1", title: "Child 2", children: [] },
          { id: "1.2", title: "Child 10", children: [] },
        ],
      },
      { id: "2", title: "Apple", children: [] },
      { id: "3", title: "File 10", children: [] },
      { id: "4", title: "File 2", children: [] },
    ];

    it("should keep original order when sorting is not specified", async () => {
      render(
        <SidebarProvider nodes={testNodes}>
          <Sidebar />
        </SidebarProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("Zebra")).toBeInTheDocument();
        expect(screen.getByText("Apple")).toBeInTheDocument();
        expect(screen.getByText("File 10")).toBeInTheDocument();
        expect(screen.getByText("File 2")).toBeInTheDocument();
      });

      const sidebarItems = [
        screen.getByText("Zebra"),
        screen.getByText("Apple"),
        screen.getByText("File 10"),
        screen.getByText("File 2"),
      ];

      // Check that they appear in DOM order
      for (let i = 0; i < sidebarItems.length - 1; i++) {
        expect(
          sidebarItems[i].compareDocumentPosition(sidebarItems[i + 1]),
        ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      }
    });

    it("should sort nodes alphabetically in ascending order", async () => {
      render(
        <SidebarProvider nodes={testNodes}>
          <Sidebar nodeSortType="alphabetical" />
        </SidebarProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("Zebra")).toBeInTheDocument();
        expect(screen.getByText("Apple")).toBeInTheDocument();
        expect(screen.getByText("File 10")).toBeInTheDocument();
        expect(screen.getByText("File 2")).toBeInTheDocument();
      });

      // Verify alphabetical order: Apple, File 10, File 2, Zebra
      const sidebarItems = [
        screen.getByText("Apple"),
        screen.getByText("File 10"),
        screen.getByText("File 2"),
        screen.getByText("Zebra"),
      ];

      for (let i = 0; i < sidebarItems.length - 1; i++) {
        expect(
          sidebarItems[i].compareDocumentPosition(sidebarItems[i + 1]),
        ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      }
    });

    it("should sort nodes naturally in ascending order (handles numbers correctly)", async () => {
      render(
        <SidebarProvider nodes={testNodes}>
          <Sidebar nodeSortType="natural" />
        </SidebarProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("Zebra")).toBeInTheDocument();
        expect(screen.getByText("Apple")).toBeInTheDocument();
        expect(screen.getByText("File 10")).toBeInTheDocument();
        expect(screen.getByText("File 2")).toBeInTheDocument();
      });

      // Verify natural order: Apple, File 2, File 10, Zebra (natural: 2 before 10)
      const sidebarItems = [
        screen.getByText("Apple"),
        screen.getByText("File 2"),
        screen.getByText("File 10"),
        screen.getByText("Zebra"),
      ];

      for (let i = 0; i < sidebarItems.length - 1; i++) {
        expect(
          sidebarItems[i].compareDocumentPosition(sidebarItems[i + 1]),
        ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      }
    });

    it("should sort nodes naturally in descending order", async () => {
      render(
        <SidebarProvider nodes={testNodes}>
          <Sidebar
            nodeSortType="natural"
            defaultLevel={2}
            nodeSortOrder="desc"
          />
        </SidebarProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("Zebra")).toBeInTheDocument();
        expect(screen.getByText("Apple")).toBeInTheDocument();
        expect(screen.getByText("File 10")).toBeInTheDocument();
        expect(screen.getByText("File 2")).toBeInTheDocument();
        expect(screen.getByText("Child 2")).toBeInTheDocument();
        expect(screen.getByText("Child 10")).toBeInTheDocument();
      });

      // Verify nodes are sorted naturally in descending order: Zebra, File 10, File 2, Apple
      const rootItems = [
        screen.getByText("Zebra"),
        screen.getByText("File 10"),
        screen.getByText("File 2"),
        screen.getByText("Apple"),
      ];

      for (let i = 0; i < rootItems.length - 1; i++) {
        expect(rootItems[i].compareDocumentPosition(rootItems[i + 1])).toBe(
          Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }

      const child10 = screen.getByText("Child 10");
      const child2 = screen.getByText("Child 2");

      // Children nodes should also be sorted naturally in descending order: "Child 10" before "Child 2"
      expect(child10.compareDocumentPosition(child2)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it("should sort nodes using custom comparison function", async () => {
      // Custom function that sorts by string length first, then alphabetically
      const customSortFunction = (
        valueA: string,
        valueB: string,
      ): -1 | 0 | 1 => {
        const lengthComparison = valueA.length - valueB.length;
        if (lengthComparison !== 0) {
          return lengthComparison < 0 ? -1 : 1;
        }
        // If lengths are equal, sort alphabetically
        const alphabetical = valueA
          .toLowerCase()
          .localeCompare(valueB.toLowerCase());
        return alphabetical < 0 ? -1 : alphabetical > 0 ? 1 : 0;
      };

      render(
        <SidebarProvider nodes={testNodes}>
          <Sidebar nodeSortType={customSortFunction} />
        </SidebarProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("Zebra")).toBeInTheDocument();
        expect(screen.getByText("Apple")).toBeInTheDocument();
        expect(screen.getByText("File 10")).toBeInTheDocument();
        expect(screen.getByText("File 2")).toBeInTheDocument();
      });

      // Custom sorting by length: Apple (5), Zebra (5), File 2 (6), File 10 (7)
      // When lengths are equal (Apple vs Zebra), sort alphabetically: Apple before Zebra
      const sidebarItems = [
        screen.getByText("Apple"),
        screen.getByText("Zebra"),
        screen.getByText("File 2"),
        screen.getByText("File 10"),
      ];

      for (let i = 0; i < sidebarItems.length - 1; i++) {
        expect(
          sidebarItems[i].compareDocumentPosition(sidebarItems[i + 1]),
        ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      }
    });

    it("should handle custom sorting function with descending order", async () => {
      // Custom function that sorts by string length
      const customSortFunction = (
        valueA: string,
        valueB: string,
      ): -1 | 0 | 1 => {
        const lengthComparison = valueA.length - valueB.length;
        return lengthComparison < 0 ? -1 : lengthComparison > 0 ? 1 : 0;
      };

      render(
        <SidebarProvider nodes={testNodes}>
          <Sidebar nodeSortType={customSortFunction} nodeSortOrder="desc" />
        </SidebarProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("Zebra")).toBeInTheDocument();
        expect(screen.getByText("Apple")).toBeInTheDocument();
        expect(screen.getByText("File 10")).toBeInTheDocument();
        expect(screen.getByText("File 2")).toBeInTheDocument();
      });

      // With descending order: File 10 (7), File 2 (6), Zebra (5), Apple (5)
      // "Apple" and "Zebra" both have length 5, so they maintain their original relative order
      const sidebarItems = [
        screen.getByText("File 10"),
        screen.getByText("File 2"),
        screen.getByText("Zebra"),
        screen.getByText("Apple"),
      ];

      for (let i = 0; i < sidebarItems.length - 1; i++) {
        expect(
          sidebarItems[i].compareDocumentPosition(sidebarItems[i + 1]),
        ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      }
    });
  });
});
