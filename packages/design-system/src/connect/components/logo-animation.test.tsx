import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// getProjectLoader reads the meta tag once per page, so each case loads a
// fresh module after setting up the page.
async function loadModule() {
  vi.resetModules();
  return import("./logo-animation.js");
}

afterEach(() => {
  document.head.querySelector('meta[name="ph-loader"]')?.remove();
});

describe("LogoAnimation", () => {
  it("draws the Powerhouse logo without a project loader", async () => {
    const { LogoAnimation, getProjectLoader } = await loadModule();
    expect(getProjectLoader()).toBeNull();
    const { container } = render(<LogoAnimation />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the project's loader image with its motion and size", async () => {
    const meta = document.createElement("meta");
    meta.name = "ph-loader";
    meta.content = "ph-loader.png";
    meta.dataset.animation = "spin";
    meta.dataset.size = "120";
    document.head.appendChild(meta);
    const { LogoAnimation } = await loadModule();
    const { container } = render(<LogoAnimation />);
    const img = container.querySelector("img");
    expect(container.querySelector("svg")).toBeNull();
    expect(img?.getAttribute("src")).toMatch(/\/ph-loader\.png$/);
    expect(img?.style.width).toBe("120px");
    expect(img?.style.animation).toContain("ph-loader-spin");
  });
});
