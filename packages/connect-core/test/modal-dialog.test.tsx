// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ModalDialog } from "../src/router/modal-frame.js";

afterEach(cleanup);

describe("ModalDialog", () => {
  it("centres itself, which Tailwind's reset undoes, and keeps the frame's classes", () => {
    render(
      <ModalDialog labelledBy="t" className="rounded-xl">
        <h2 id="t">Title</h2>
      </ModalDialog>,
    );
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog.className).toBe("m-auto rounded-xl");
  });
});
