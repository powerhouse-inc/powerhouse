import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { ensurePHEventHandlers } from "../src/graphql-client/graphql-reactor-provider.js";
import { usePHModal, useModalLinkProps } from "../src/hooks/modals.js";
import { getPHNavigation } from "../src/hooks/navigation.js";

const modal = {
  type: "createDocument",
  documentType: "powerhouse/todo",
} as const;

function NewTodoLink() {
  const open = usePHModal();
  return (
    <>
      <a {...useModalLinkProps(modal)}>New todo list</a>
      <p data-testid="open">{open?.type ?? "none"}</p>
    </>
  );
}

describe("useModalLinkProps", () => {
  beforeEach(() => {
    window.ph = {};
    delete window.__phEventHandlersRegistered;
    ensurePHEventHandlers();
    history.replaceState(null, "", "/drives?view=grid");
  });

  afterEach(() => {
    window.ph = {};
    delete window.__phEventHandlersRegistered;
    history.replaceState(null, "", "/");
  });

  it("links to the modal over the current page, and opens it in place on a plain click", async () => {
    const screen = await render(<NewTodoLink />);
    const link = screen.getByRole("link", { name: "New todo list" });
    await expect
      .element(link)
      .toHaveAttribute(
        "href",
        "/drives?view=grid&modal=create-document&documentType=powerhouse%2Ftodo",
      );

    await link.click();
    await expect
      .element(screen.getByTestId("open"))
      .toHaveTextContent("createDocument");
    expect(location.pathname).toBe("/drives");
  });

  it("keeps the href current as the page's search changes", async () => {
    const screen = await render(<NewTodoLink />);
    getPHNavigation().setSearch((prev) => ({ ...prev, view: "list" }));
    await expect
      .element(screen.getByRole("link", { name: "New todo list" }))
      .toHaveAttribute(
        "href",
        "/drives?view=list&modal=create-document&documentType=powerhouse%2Ftodo",
      );
  });
});
