// @vitest-environment happy-dom
import { fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  BARE,
  FULL,
  hostExport,
  stack,
} from "../../host-rules/__fixtures__/hosts.js";
import { fakeBuilderClient } from "../__fixtures__/fakes.js";
import { renderStep, type RenderedStep } from "../__fixtures__/steps.js";
import { fixIssuesFirst, START_BLOCKERS } from "../copy.js";
import { startBlocker, UseStep } from "./UseStep.js";

function startButton(view: RenderedStep["view"]) {
  return view.getByRole("button", { name: "Start" });
}

describe("startBlocker", () => {
  it("names the first thing in the way", () => {
    const ready = { issues: 0, controller: true, served: true, wired: true };
    expect(startBlocker(ready)).toBeUndefined();
    expect(startBlocker({ ...ready, issues: 2 })).toBe(fixIssuesFirst(2));
    expect(startBlocker({ ...ready, controller: false })).toBe(
      START_BLOCKERS.noController,
    );
    expect(startBlocker({ ...ready, served: undefined })).toBe(
      START_BLOCKERS.checking,
    );
    expect(startBlocker({ ...ready, served: false })).toBe(
      START_BLOCKERS.notServed,
    );
    expect(startBlocker({ ...ready, wired: false })).toBe(
      START_BLOCKERS.notWired,
    );
  });
});

describe("UseStep", () => {
  it("keeps Start off while the draft has issues", () => {
    const { view } = renderStep(UseStep, {
      envelope: stack(),
      env: { NODE_OPTIONS: "x" },
      context: FULL,
      extra: { client: fakeBuilderClient().client, onStart: vi.fn() },
    });
    expect(startButton(view)).toHaveProperty("disabled", true);
    expect(view.getByText(fixIssuesFirst(1))).toBeTruthy();
  });

  it("keeps Start off without a controller", () => {
    const { view } = renderStep(UseStep, {
      envelope: hostExport("connect"),
      context: { ...BARE, controller: false },
      extra: { onStart: vi.fn() },
    });
    expect(startButton(view)).toHaveProperty("disabled", true);
    expect(view.getByText(START_BLOCKERS.noController)).toBeTruthy();
  });

  it("sends an import from a project the controller doesn't serve to Download", async () => {
    const envelope = {
      ...hostExport("switchboard"),
      project: { name: "elsewhere", root: "/elsewhere" },
    };
    const { view } = renderStep(UseStep, {
      envelope,
      base: { kind: "import", export: envelope },
      context: FULL,
      extra: { client: fakeBuilderClient().client, onStart: vi.fn() },
    });
    await waitFor(() =>
      expect(view.getByText(START_BLOCKERS.notServed)).toBeTruthy(),
    );
    expect(startButton(view)).toHaveProperty("disabled", true);
  });

  it("starts a clean project draft when wired", async () => {
    const onStart = vi.fn();
    const { view, draft } = renderStep(UseStep, {
      envelope: hostExport("switchboard"),
      context: FULL,
      extra: { client: fakeBuilderClient().client, onStart },
    });
    await waitFor(() =>
      expect(startButton(view)).toHaveProperty("disabled", false),
    );
    fireEvent.click(startButton(view));
    expect(onStart).toHaveBeenCalledWith(draft);
  });

  it("copies each changed host file", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { view, engine } = renderStep(UseStep, {
      envelope: stack(),
      setters: [
        { path: "host.name", value: "renamed" },
        { path: "members.switchboard.runner.dev", value: true },
      ],
      context: FULL,
      extra: {},
    });
    fireEvent.click(
      view.getByRole("button", { name: "Copy hosts/switchboard/host.js" }),
    );
    await waitFor(() =>
      expect(view.getByRole("status").textContent).toBe(
        "Copied hosts/switchboard/host.js.",
      ),
    );
    const copied = (writeText.mock.calls[0] as unknown[])[0] as string;
    expect(copied).toContain('"dev": true');
    expect(
      view.getByRole("button", { name: "Copy hosts/stack/host.js" }),
    ).toBeTruthy();
    expect(
      view.getByRole("button", {
        name: `Download ${engine.envelope.name}.host-export.json`,
      }),
    ).toBeTruthy();
  });
});
