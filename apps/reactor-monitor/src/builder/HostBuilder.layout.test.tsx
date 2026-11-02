/// <reference types="vite/client" />
import "../../style.css";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { App } from "../App.js";
import { baseDigest } from "../controller/api.js";
import { stack } from "../host-rules/__fixtures__/hosts.js";
import { MonitoringSetsStore } from "../monitoring-sets.js";
import { PROJECT } from "./__fixtures__/fakes.js";
import { newDraft, saveDraft, withStep, type StepId } from "./draft.js";

const SIZES = [
  { name: "desktop", width: 1280, height: 800, phone: false },
  { name: "phone", width: 390, height: 844, phone: true },
] as const;

const STEPS: StepId[] = ["start", "basics", "members", "reactor", "use"];

function freshStore(): MonitoringSetsStore {
  const cells = new Map<string, string>();
  return new MonitoringSetsStore({
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => {
      cells.set(key, value);
    },
  });
}

async function openBuilder(step: StepId) {
  const envelope = stack();
  const draft = newDraft(
    { kind: "project", project: PROJECT, host: "stack", export: envelope },
    await baseDigest(envelope),
  );
  saveDraft(window.localStorage, withStep(draft, step));
  const view = render(<App store={freshStore()} />);
  fireEvent.click(view.getByRole("button", { name: "Build host" }));
  const builder = view.container.querySelector<HTMLElement>("[data-builder]");
  if (!builder) throw new Error("the builder didn't open");
  await waitFor(() => expect(builder.querySelector(".hb-step")).not.toBeNull());
  const part = (selector: string) => {
    const found = builder.querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`no ${selector}`);
    return found;
  };
  return {
    view,
    builder,
    footer: part(".hb-foot"),
    scroller: part("[data-scroll]"),
    aside: part("aside"),
  };
}

function scrollsVertically(element: Element): boolean {
  const { overflowY } = getComputedStyle(element);
  return (
    (overflowY === "auto" || overflowY === "scroll") &&
    element.scrollHeight > element.clientHeight + 1
  );
}

function expectPageStill() {
  const root = document.scrollingElement ?? document.documentElement;
  expect(root.scrollHeight).toBeLessThanOrEqual(window.innerHeight);
  expect(root.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  window.scrollTo(10_000, 10_000);
  expect(window.scrollX).toBe(0);
  expect(window.scrollY).toBe(0);
}

describe.each(SIZES)("builder layout at $width×$height", (size) => {
  beforeEach(async () => {
    window.localStorage.clear();
    await page.viewport(size.width, size.height);
  });

  it.each(STEPS)("keeps Back and Next on screen on %s", async (step) => {
    const { footer } = await openBuilder(step);
    expect(window.innerHeight).toBe(size.height);
    expect(footer.getBoundingClientRect().bottom).toBeCloseTo(size.height, 0);
    expectPageStill();
  });

  it.each(STEPS)("scrolls only [data-scroll] on %s", async (step) => {
    const { builder, scroller } = await openBuilder(step);
    const scrolling = [...builder.querySelectorAll("*")].filter(
      scrollsVertically,
    );
    expect(scrolling.filter((element) => element !== scroller)).toEqual([]);
    expectPageStill();
  });

  it("scrolls a long step inside [data-scroll], not the page", async () => {
    const { scroller } = await openBuilder("reactor");
    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    scroller.scrollTop = 200;
    expect(scroller.scrollTop).toBeGreaterThan(0);
    expectPageStill();
  });

  if (size.phone) {
    it("shows the summary only as a sheet over the footer", async () => {
      const { view, aside, footer } = await openBuilder("reactor");
      expect(getComputedStyle(aside).display).toBe("none");
      fireEvent.click(view.getByRole("button", { name: "Summary" }));
      await waitFor(() => expect(getComputedStyle(aside).display).toBe("flex"));
      const sheet = aside.getBoundingClientRect();
      expect(getComputedStyle(aside).position).toBe("fixed");
      expect(sheet.left).toBe(0);
      expect(sheet.right).toBeCloseTo(size.width, 0);
      expect(sheet.bottom).toBeCloseTo(footer.getBoundingClientRect().top, 0);
      expect(sheet.top).toBeGreaterThan(0);
      expectPageStill();
    });
  } else {
    it("shows the summary beside the step", async () => {
      const { view, aside, scroller } = await openBuilder("reactor");
      expect(view.queryByRole("button", { name: "Summary" })).toBeNull();
      expect(getComputedStyle(aside).position).toBe("static");
      expect(aside.getBoundingClientRect().left).toBeCloseTo(
        scroller.getBoundingClientRect().right,
        0,
      );
    });
  }
});
