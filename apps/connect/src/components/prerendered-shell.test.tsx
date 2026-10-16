// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  adoptPrerenderedShell,
  hasPrerenderedShell,
  LoadingShell,
  useReleasePrerenderedShell,
} from "./prerendered-shell.js";

const Fallback = () => <p>skeleton</p>;

function prerenderedRoot() {
  const root = document.createElement("div");
  root.innerHTML = `<div data-ph-shell style="display:contents"><div id="content-view">home</div></div>`;
  return root;
}

function Released() {
  useReleasePrerenderedShell(true);
  return null;
}

afterEach(() => {
  render(<Released />).unmount();
});

describe("prerendered shell", () => {
  it("renders the adopted markup in the same marked wrapper", () => {
    adoptPrerenderedShell(prerenderedRoot());
    const { container } = render(<LoadingShell Fallback={Fallback} />);
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.hasAttribute("data-ph-shell")).toBe(true);
    expect(shell.hasAttribute("inert")).toBe(true);
    expect(shell.style.display).toBe("contents");
    expect(shell.style.getPropertyValue("--ph-shell-t")).toMatch(/^-\d+ms$/);
    expect(shell.innerHTML).toBe(`<div id="content-view">home</div>`);
  });

  it("falls back once released, and when the page has no shell", () => {
    document.documentElement.classList.add("ph-shell-route", "ph-shell-embed");
    const critical = document.createElement("style");
    critical.setAttribute("data-ph-shell", "");
    document.head.append(critical);
    adoptPrerenderedShell(prerenderedRoot());
    render(<Released />);
    expect(hasPrerenderedShell()).toBe(false);
    // Its critical CSS would otherwise outrank the full stylesheet's rules.
    expect(document.head.querySelector("style[data-ph-shell]")).toBeNull();
    // The guard's classes go with the shell.
    expect(document.documentElement.classList.contains("ph-shell-route")).toBe(
      false,
    );
    expect(document.documentElement.classList.contains("ph-shell-embed")).toBe(
      false,
    );

    adoptPrerenderedShell(document.createElement("div"));
    render(<LoadingShell Fallback={Fallback} />);
    expect(screen.getByText("skeleton")).toBeTruthy();
  });
});
