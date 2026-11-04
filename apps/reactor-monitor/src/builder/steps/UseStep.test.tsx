// @vitest-environment happy-dom
import { fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  BARE,
  FULL,
  hostExport,
  stack,
} from "../../host-rules/__fixtures__/hosts.js";
import { ControllerRequestError } from "../../controller/client.js";
import { fakeBuilderClient } from "../__fixtures__/fakes.js";

/** The edit that adds the catalog's switchboard to a blank host. */
function addSwitchboard() {
  const option = hostOptions({ envelope: blankExport() }, FULL).find(
    (candidate) => candidate.id === "host:add:switchboard",
  );
  if (!option) throw new Error("no add switchboard");
  return option.setters;
}
import { renderStep, type RenderedStep } from "../__fixtures__/steps.js";
import {
  blankExport,
  fixIssuesFirst,
  hostOptions,
  START_REASONS,
} from "../../host-rules/index.js";
import { withProject } from "../draft.js";
import { PROJECT } from "../__fixtures__/fakes.js";
import { linkedStack, runOf } from "../__fixtures__/route.js";
import { UseStep } from "./UseStep.js";

function startButton(view: RenderedStep["view"]) {
  return view.getByRole("button", { name: "Start" });
}

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
    expect(view.getByText(START_REASONS.noController)).toBeTruthy();
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
      expect(view.getByText(START_REASONS.notServed)).toBeTruthy(),
    );
    expect(startButton(view)).toHaveProperty("disabled", true);
  });

  it("asks a blank host for a reactor, then for a project to run in", async () => {
    const empty = renderStep(UseStep, {
      envelope: blankExport(),
      base: { kind: "blank", export: blankExport() },
      context: FULL,
      extra: { client: fakeBuilderClient().client, onStart: vi.fn() },
    });
    expect(empty.view.getByText(START_REASONS.noReactors)).toBeTruthy();
    empty.view.unmount();

    const { view, draft, onDraft } = renderStep(UseStep, {
      envelope: blankExport(),
      base: { kind: "blank", export: blankExport() },
      setters: addSwitchboard(),
      context: FULL,
      extra: { client: fakeBuilderClient().client, onStart: vi.fn() },
    });
    expect(startButton(view)).toHaveProperty("disabled", true);
    expect(view.getByText(START_REASONS.noProject)).toBeTruthy();
    await waitFor(() =>
      expect(view.getByRole("option", { name: /my-project/ })).toBeTruthy(),
    );
    fireEvent.change(
      view.getByRole("combobox", { name: /Project to run it in/ }),
      { target: { value: PROJECT } },
    );
    expect(onDraft).toHaveBeenCalledWith(withProject(draft, PROJECT));
  });

  it("shows a project that is no longer served as unchosen", async () => {
    const { view, draft, onDraft } = renderStep(UseStep, {
      envelope: blankExport(),
      base: { kind: "blank", export: blankExport(), project: "/gone" },
      setters: addSwitchboard(),
      context: FULL,
      extra: { client: fakeBuilderClient().client, onStart: vi.fn() },
    });
    await waitFor(() =>
      expect(view.getByText(START_REASONS.projectGone)).toBeTruthy(),
    );
    const picker = view.getByRole("combobox", {
      name: /Project to run it in/,
    }) as HTMLSelectElement;
    expect(picker.value).toBe("");
    fireEvent.change(picker, { target: { value: PROJECT } });
    expect(onDraft).toHaveBeenCalledWith(withProject(draft, PROJECT));
  });

  it("sends a downloaded blank host back to Blank", () => {
    const { view } = renderStep(UseStep, {
      envelope: blankExport(),
      base: { kind: "import", export: blankExport() },
      setters: addSwitchboard(),
      context: FULL,
      extra: { client: fakeBuilderClient().client, onStart: vi.fn() },
    });
    expect(view.getByText(START_REASONS.blankImport)).toBeTruthy();
  });

  it("starts a blank host in the project chosen for it", async () => {
    const onStart = vi.fn();
    const { view, draft, engine } = renderStep(UseStep, {
      envelope: blankExport(),
      base: { kind: "blank", export: blankExport(), project: PROJECT },
      setters: addSwitchboard(),
      context: FULL,
      extra: { client: fakeBuilderClient().client, onStart },
    });
    await waitFor(() =>
      expect(startButton(view)).toHaveProperty("disabled", false),
    );
    fireEvent.click(startButton(view));
    expect(onStart).toHaveBeenCalledWith(draft, engine);
  });

  it("downloads and copies a blank host's host.js with no controller", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { view } = renderStep(UseStep, {
      envelope: blankExport(),
      base: { kind: "blank", export: blankExport() },
      context: { ...BARE, controller: false },
      extra: {},
    });
    expect(
      view.getByRole("button", { name: "Download blank.host-export.json" }),
    ).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Copy host.js" }));
    await waitFor(() =>
      expect(view.getByRole("status").textContent).toBe(
        "Copied hosts/blank/host.js.",
      ),
    );
    const copied = (writeText.mock.calls[0] as unknown[])[0] as string;
    expect(copied).toContain('"children": {}');
  });

  it("starts a clean project draft when wired", async () => {
    const onStart = vi.fn();
    const { view, draft, engine } = renderStep(UseStep, {
      envelope: hostExport("switchboard"),
      context: FULL,
      extra: { client: fakeBuilderClient().client, onStart },
    });
    await waitFor(() =>
      expect(startButton(view)).toHaveProperty("disabled", false),
    );
    fireEvent.click(startButton(view));
    expect(onStart).toHaveBeenCalledWith(draft, engine);
  });

  it("hands a refused start over to the host-changed choices", async () => {
    const onBaseChanged = vi.fn();
    const onStart = vi.fn(() =>
      Promise.reject(
        new ControllerRequestError("base_changed", "The host changed.", 409),
      ),
    );
    const { view } = renderStep(UseStep, {
      envelope: hostExport("switchboard"),
      context: FULL,
      extra: { client: fakeBuilderClient().client, onStart, onBaseChanged },
    });
    await waitFor(() =>
      expect(startButton(view)).toHaveProperty("disabled", false),
    );
    fireEvent.click(startButton(view));
    await waitFor(() => expect(onBaseChanged).toHaveBeenCalledOnce());
  });

  it("lists the controller's findings under a start it refused at the check", async () => {
    const onStart = vi.fn(() =>
      Promise.reject(
        new ControllerRequestError(
          "check_failed",
          "hosts/switchboard failed its check with 1 issue(s).",
          422,
          [
            {
              stage: "declared",
              file: "hosts/switchboard/host.js",
              path: "reactor.backends.sb.remote.url",
              message: 'names host "sb", which cannot be loaded.',
            },
          ],
        ),
      ),
    );
    const { view } = renderStep(UseStep, {
      envelope: hostExport("switchboard"),
      context: FULL,
      extra: { client: fakeBuilderClient().client, onStart },
    });
    await waitFor(() =>
      expect(startButton(view)).toHaveProperty("disabled", false),
    );
    fireEvent.click(startButton(view));
    await waitFor(() =>
      expect(view.getByRole("status").textContent).toBe(
        "Couldn't start: hosts/switchboard failed its check with 1 issue(s).",
      ),
    );
    expect(
      view.getByText('names host "sb", which cannot be loaded.'),
    ).toBeTruthy();
    expect(
      view.getByText(
        "declared · hosts/switchboard/host.js · reactor.backends.sb.remote.url",
      ),
    ).toBeTruthy();
  });

  it("links each rule finding of a refused start to its step", async () => {
    const onStart = vi.fn(() =>
      Promise.reject(
        new ControllerRequestError(
          "check_failed",
          "hosts/switchboard has 1 problem(s) to fix first.",
          422,
          undefined,
          [{ rule: "env", path: "env.NODE_OPTIONS", message: "Not allowed." }],
        ),
      ),
    );
    const { view, onStep } = renderStep(UseStep, {
      envelope: hostExport("switchboard"),
      context: FULL,
      extra: { client: fakeBuilderClient().client, onStart },
    });
    await waitFor(() =>
      expect(startButton(view)).toHaveProperty("disabled", false),
    );
    fireEvent.click(startButton(view));
    await waitFor(() => expect(view.getByText("Not allowed.")).toBeTruthy());
    fireEvent.click(view.getByRole("button", { name: "Go to Environment" }));
    expect(onStep).toHaveBeenCalledWith("environment");
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

  it("lists where a started Connect keeps its drives and routes its reactors", () => {
    const onRoute = vi.fn();
    const { view } = renderStep(UseStep, {
      envelope: stack(),
      setters: linkedStack().setters,
      context: FULL,
      extra: { run: runOf(), onRoute },
    });
    const drives = view.getByRole("list", {
      name: "Where ui keeps its drives",
    });
    expect(
      [...drives.querySelectorAll("li")].map((item) => item.textContent),
    ).toEqual(["In this browser", "shared on sb"]);
    fireEvent.click(
      view.getByRole("button", { name: "Route this app's reactors" }),
    );
    expect(onRoute).toHaveBeenCalledOnce();
    expect(onRoute.mock.calls[0][0]).toMatchObject({
      app: "ui",
      backends: [
        { reactor: "ui.main", backend: "main" },
        { reactor: "sb-inst-1", backend: "sb" },
      ],
      collections: { "id-shared": "sb-inst-1" },
    });
  });

  it("offers no routing before the switchboard is attached", () => {
    const run = runOf();
    const { view } = renderStep(UseStep, {
      envelope: stack(),
      setters: linkedStack().setters,
      context: FULL,
      extra: {
        run: runOf({ attached: { ...run.attached, remote: [] } }),
        onRoute: vi.fn(),
      },
    });
    expect(
      view.queryByRole("button", { name: "Route this app's reactors" }),
    ).toBeNull();
  });
});
