// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@powerhousedao/design-system", () => ({
  Icon: () => null,
  PowerhouseButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
}));

const { StoredDocumentsRefusedFallback } =
  await import("./stored-documents-refused.js");

describe("StoredDocumentsRefusedFallback", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the refusal and reloads to pick up a changed config", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });

    render(
      <StoredDocumentsRefusedFallback
        error={
          new Error(
            "This browser holds 3 document(s) that require base-reducer 7",
          )
        }
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "Connect cannot open this browser's documents",
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "require base-reducer 7",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
