import { fireEvent, render, screen } from "@testing-library/react";
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
    vi.useFakeTimers();
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
    // The auto-pager defers the call with setTimeout(0) so the status line
    // paints between pages; run the timer to observe it.
    vi.runAllTimers();
    expect(onLoadNextPage).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does not ask for the next page while a page is loading", () => {
    vi.useFakeTimers();
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
    vi.runAllTimers();
    expect(onLoadNextPage).not.toHaveBeenCalled();
    expect(screen.getByText("Loading operations…")).toBeInTheDocument();
    expect(screen.getByText("3 loaded so far")).toBeInTheDocument();
    expect(screen.queryByText(/Revision \d/)).not.toBeInTheDocument();
    expect(screen.queryAllByText("Next")).toHaveLength(0);
    vi.useRealTimers();
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

describe("RevisionHistory (legacy props)", () => {
  const legacyBaseProps = {
    documentTitle: "Doc",
    documentId: "doc-1",
    onClose: vi.fn(),
  };

  it("renders the global scope by default", () => {
    // Compile-time: this render call passes only the legacy props
    // (`globalOperations`/`localOperations`, no scoped props) and must
    // typecheck against `RevisionHistoryProps`.
    render(
      <RevisionHistory
        {...legacyBaseProps}
        globalOperations={globalOperations.slice(0, 3)}
        localOperations={[]}
      />,
    );
    expect(
      screen.queryByText("This document has no recorded operations yet."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Global scope")).toBeInTheDocument();
  });

  it("shows the empty message, never the loading message, when there are no operations", () => {
    render(
      <RevisionHistory
        {...legacyBaseProps}
        globalOperations={[]}
        localOperations={[]}
      />,
    );
    expect(
      screen.getByText("This document has no recorded operations yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading operations…")).not.toBeInTheDocument();
  });

  it("renders the local scope's operations once switched", () => {
    render(
      <RevisionHistory
        {...legacyBaseProps}
        globalOperations={globalOperations.slice(0, 3)}
        localOperations={[]}
      />,
    );
    // Open the scope selector (its trigger shows the current scope's label)
    // and pick "Local scope"; the dropdown never lists the currently
    // selected scope, so each label is unique at every step.
    fireEvent.click(screen.getByText("Global scope"));
    fireEvent.click(screen.getByText("Local scope"));

    expect(
      screen.getByText("This document has no recorded operations yet."),
    ).toBeInTheDocument();
    expect(screen.getByText("Local scope")).toBeInTheDocument();
  });
});
