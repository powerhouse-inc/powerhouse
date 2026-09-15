import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { globalOperations } from "./mocks.js";
import { RevisionHistory } from "./revision-history.js";

const baseProps = {
  documentTitle: "Doc",
  documentId: "doc-1",
  scopes: ["global", "local"],
  scope: "global",
  onScopeChange: vi.fn(),
  onClose: vi.fn(),
};

describe("RevisionHistory", () => {
  it("asks for the next page when more exist and nothing is loading", () => {
    const onLoadNextPage = vi.fn();
    render(
      <RevisionHistory
        {...baseProps}
        operations={globalOperations.slice(0, 3)}
        isLoading={false}
        hasNextPage={true}
        onLoadNextPage={onLoadNextPage}
      />,
    );
    expect(onLoadNextPage).toHaveBeenCalledTimes(1);
  });

  it("does not ask for the next page while a page is loading", () => {
    const onLoadNextPage = vi.fn();
    render(
      <RevisionHistory
        {...baseProps}
        operations={globalOperations.slice(0, 3)}
        isLoading={true}
        hasNextPage={true}
        onLoadNextPage={onLoadNextPage}
      />,
    );
    expect(onLoadNextPage).not.toHaveBeenCalled();
    expect(screen.getByText("Loading more operations…")).toBeInTheDocument();
  });

  it("does not ask for the next page when there is none", () => {
    const onLoadNextPage = vi.fn();
    render(
      <RevisionHistory
        {...baseProps}
        operations={globalOperations.slice(0, 3)}
        isLoading={false}
        hasNextPage={false}
        onLoadNextPage={onLoadNextPage}
      />,
    );
    expect(onLoadNextPage).not.toHaveBeenCalled();
  });

  it("shows a loading message, not the empty message, while the first page loads", () => {
    render(
      <RevisionHistory
        {...baseProps}
        operations={[]}
        isLoading={true}
        hasNextPage={false}
        onLoadNextPage={vi.fn()}
      />,
    );
    expect(screen.getByText("Loading operations…")).toBeInTheDocument();
    expect(
      screen.queryByText("This document has no recorded operations yet."),
    ).not.toBeInTheDocument();
  });

  it("shows the empty message once loading finished with no operations", () => {
    render(
      <RevisionHistory
        {...baseProps}
        operations={[]}
        isLoading={false}
        hasNextPage={false}
        onLoadNextPage={vi.fn()}
      />,
    );
    expect(
      screen.getByText("This document has no recorded operations yet."),
    ).toBeInTheDocument();
  });

  it("hides the pagination bar while more pages are still loading", () => {
    render(
      <RevisionHistory
        {...baseProps}
        operations={globalOperations.slice(0, 5)}
        itemsPerPage={2}
        isLoading={true}
        hasNextPage={true}
        onLoadNextPage={vi.fn()}
      />,
    );
    expect(screen.queryAllByText("Next")).toHaveLength(0);
  });

  it("shows the pagination bar once loading has caught up", () => {
    render(
      <RevisionHistory
        {...baseProps}
        operations={globalOperations.slice(0, 5)}
        itemsPerPage={2}
        isLoading={false}
        hasNextPage={false}
        onLoadNextPage={vi.fn()}
      />,
    );
    // The panel renders the pagination bar both above and below the
    // timeline, so "Next" appears twice while it is showing.
    expect(screen.getAllByText("Next").length).toBeGreaterThan(0);
  });

  it("lists the given scopes in the selector", () => {
    render(
      <RevisionHistory
        {...baseProps}
        scopes={["global", "audit"]}
        scope="audit"
        operations={[]}
        isLoading={false}
        hasNextPage={false}
        onLoadNextPage={vi.fn()}
      />,
    );
    expect(screen.getByText("Audit scope")).toBeInTheDocument();
  });
});
