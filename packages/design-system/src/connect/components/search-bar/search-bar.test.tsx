import { fireEvent, render, screen } from "@testing-library/react";
import { it, vi } from "vitest";
import type { ConnectSearchBarProps } from "./search-bar.js";
import { ConnectSearchBar } from "./search-bar.js";

const filterItems: ConnectSearchBarProps["filterItems"] = [
  {
    id: "project",
    label: ".project",
  },
  {
    id: "budget",
    label: ".budget",
  },
  {
    id: "profile",
    label: ".profile",
  },
  {
    id: "legal",
    label: ".legal",
  },
  {
    id: "atlas",
    label: ".Atlas",
  },
];

describe("ConnectSearchBar Component", () => {
  it("should match snapshot", async () => {
    const { asFragment } = render(
      <ConnectSearchBar
        filterItems={filterItems}
        filterLabel="File type"
        onChange={() => {}}
        placeholder="Search Files"
        value="test"
      />,
    );

    expect(asFragment()).toMatchSnapshot();
  });

  it("should call onChange when input value is changed", () => {
    const onChange = vi.fn();

    render(
      <ConnectSearchBar
        data-testid="search-bar"
        filterItems={filterItems}
        filterLabel="File type"
        onChange={onChange}
        placeholder="Search Files"
        value=""
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "test" },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("test");
  });

  it("should display filter selected in filter label", () => {
    render(
      <ConnectSearchBar
        data-testid="search-bar"
        filterItems={filterItems}
        filterLabel="File type"
        onChange={() => {}}
        placeholder="Search Files"
        selectedFilter="project"
        value="test"
      />,
    );

    expect(screen.getByText(".project")).toBeInTheDocument();
    expect(screen.queryByText("File type")).not.toBeInTheDocument();
  });
});
