// @vitest-environment happy-dom
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import type { HostExport } from "@powerhousedao/host-core/schema";
import { describe, expect, it, vi } from "vitest";
import { baseDigest } from "../controller/api.js";
import { ControllerRequestError } from "../controller/client.js";
import { stack } from "../host-rules/__fixtures__/hosts.js";
import {
  fakeBuilderClient,
  memoryStorage,
  PROJECT,
} from "./__fixtures__/fakes.js";
import {
  addEdit,
  DRAFT_STORAGE_KEY,
  loadDraft,
  newDraft,
  saveDraft,
  withEnv,
  type BuilderDraft,
} from "./draft.js";
import { applySetters } from "../host-rules/setters.js";
import { HostBuilder } from "./HostBuilder.js";

async function savedDraft(change: (draft: BuilderDraft) => BuilderDraft) {
  const storage = memoryStorage();
  const envelope = stack();
  const draft = change(
    newDraft(
      { kind: "project", project: PROJECT, host: "stack", export: envelope },
      await baseDigest(envelope),
    ),
  );
  saveDraft(storage, draft);
  return storage;
}

function steps(view: ReturnType<typeof render>) {
  return within(view.getByRole("navigation", { name: "Steps" }));
}

describe("HostBuilder", () => {
  it("opens on Start with every later step closed", () => {
    const view = render(<HostBuilder storage={memoryStorage()} />);
    const nav = steps(view);
    expect(
      nav.getByRole("button", { name: /Start/ }).getAttribute("aria-current"),
    ).toBe("step");
    expect(nav.getByRole("button", { name: /Review/ })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      view.getByRole("button", { name: /Next: Host basics/ }),
    ).toHaveProperty("disabled", true);
  });

  it("loads a project host, walks the steps and keeps the draft across a remount", async () => {
    const storage = memoryStorage();
    const { client } = fakeBuilderClient();
    const first = render(<HostBuilder client={client} storage={storage} />);
    await waitFor(() =>
      expect(first.getByRole("option", { name: "stack" })).toBeTruthy(),
    );
    fireEvent.click(first.getByRole("button", { name: "Load host" }));
    await waitFor(() =>
      expect(first.getByRole("heading", { name: "Host basics" })).toBeTruthy(),
    );
    fireEvent.click(first.getByRole("button", { name: "Next: Reactors" }));
    fireEvent.click(
      first.getByRole("button", { name: "Next: Configure each reactor" }),
    );
    expect(
      first.getByRole("heading", { name: "Configure each reactor" }),
    ).toBeTruthy();
    expect(storage.data.get(DRAFT_STORAGE_KEY)).toContain('"step":"reactor"');
    first.unmount();

    const second = render(<HostBuilder client={client} storage={storage} />);
    await waitFor(() =>
      expect(
        second.getByRole("heading", { name: "Configure each reactor" }),
      ).toBeTruthy(),
    );
    fireEvent.click(second.getByRole("button", { name: "← Back" }));
    expect(second.getByRole("heading", { name: "Reactors" })).toBeTruthy();
  });

  it("marks the step with an issue and links to it from the summary", async () => {
    const storage = await savedDraft((draft) =>
      withEnv(draft, { NODE_OPTIONS: "x" }),
    );
    const { client } = fakeBuilderClient();
    const view = render(<HostBuilder client={client} storage={storage} />);
    await waitFor(() =>
      expect(
        steps(view)
          .getByRole("button", { name: /Environment/ })
          .getAttribute("data-state"),
      ).toBe("bad"),
    );
    expect(
      steps(view)
        .getByRole("button", { name: /Reactors/ })
        .getAttribute("data-state"),
    ).toBeNull();
    const summary = within(
      view.getByRole("complementary", { name: "Summary" }),
    );
    fireEvent.click(summary.getByRole("button", { name: "Go to Environment" }));
    expect(view.getByRole("heading", { name: "Environment" })).toBeTruthy();
  });

  it("says when an edit changed other settings, and undoes it", async () => {
    const storage = await savedDraft((draft) => ({
      ...draft,
      step: "members",
    }));
    const { client } = fakeBuilderClient();
    const view = render(<HostBuilder client={client} storage={storage} />);
    await waitFor(() =>
      expect(view.getByRole("button", { name: "Switchboard" })).toHaveProperty(
        "disabled",
        false,
      ),
    );
    fireEvent.click(view.getByRole("button", { name: "Connect" }));
    const summary = within(
      view.getByRole("complementary", { name: "Summary" }),
    );
    expect(summary.getByText("connect")).toBeTruthy();
    expect(view.queryByRole("status")).toBeNull();

    fireEvent.click(steps(view).getByRole("button", { name: /Configure/ }));
    fireEvent.click(
      within(view.getByRole("group", { name: "Access control" })).getByRole(
        "button",
        { name: "Deletion history" },
      ),
    );
    const banner = view.getByRole("status");
    expect(banner.textContent).toContain("Your edit changed 2 other settings.");
    fireEvent.click(within(banner).getByRole("button", { name: "Undo" }));
    expect(view.queryByRole("status")).toBeNull();
    expect(loadDraft(storage)?.edits).toEqual([1]);
    expect(
      within(view.getByRole("group", { name: "Access control" }))
        .getByRole("button", { name: "Off" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("opens the summary as a sheet from the footer", () => {
    const view = render(<HostBuilder storage={memoryStorage()} />);
    const aside = view.getByRole("complementary", { name: "Summary" });
    expect(aside.getAttribute("data-open")).toBe("false");
    fireEvent.click(view.getByRole("button", { name: "Summary" }));
    expect(aside.getAttribute("data-open")).toBe("true");
    fireEvent.click(within(aside).getByRole("button", { name: "Close" }));
    expect(aside.getAttribute("data-open")).toBe("false");
  });

  describe("when the project's host changed", () => {
    function withoutUi(): HostExport {
      const base = stack();
      const host = base.host as { children: Record<string, unknown> };
      const { connect: _connect, ...members } = base.members;
      return {
        ...base,
        host: { ...host, children: { sb: host.children.sb } },
        members,
      } as unknown as HostExport;
    }

    async function changedHost(fresh: HostExport) {
      const storage = await savedDraft((draft) => ({
        ...addEdit(addEdit(draft, [{ path: "host.name", value: "renamed" }]), [
          { path: "host.children.ui.runner.dev", value: true },
        ]),
        step: "review",
      }));
      const freshDigest = await baseDigest(fresh);
      const { client } = fakeBuilderClient({
        checkDraft: () =>
          Promise.reject(
            new ControllerRequestError(
              "base_changed",
              "The host changed since the draft was made.",
              409,
            ),
          ),
        exportHost: () =>
          Promise.resolve({ export: fresh, baseDigest: freshDigest }),
      });
      const view = render(<HostBuilder client={client} storage={storage} />);
      await waitFor(() =>
        expect(view.getByRole("button", { name: "Check now" })).toHaveProperty(
          "disabled",
          false,
        ),
      );
      fireEvent.click(view.getByRole("button", { name: "Check now" }));
      const alert = await view.findByRole("alert");
      return { view, storage, alert: within(alert), freshDigest };
    }

    it("previews every edit on the new version and saves it on Confirm", async () => {
      const fresh = applySetters(stack(), [
        { path: "members.switchboard.runner.port", value: 4555 },
      ]).envelope;
      const { view, storage, alert, freshDigest } = await changedHost(fresh);
      const before = loadDraft(storage);
      fireEvent.click(
        alert.getByRole("button", {
          name: "Apply my changes to the new version",
        }),
      );
      await waitFor(() =>
        expect(
          view.getByText("All 2 of your changes carry over."),
        ).toBeTruthy(),
      );
      expect(loadDraft(storage)).toEqual(before);
      fireEvent.click(view.getByRole("button", { name: "Confirm" }));
      expect(
        view.getByText(
          "Your changes are on the new version now. The checks ran again.",
        ),
      ).toBeTruthy();
      const saved = loadDraft(storage);
      expect(saved?.baseDigest).toBe(freshDigest);
      expect(saved?.setters).toHaveLength(2);
    });

    it("loses no edit that doesn't apply until Confirm, and none on Cancel", async () => {
      const created = vi.fn(() => "blob:draft");
      Object.assign(URL, {
        createObjectURL: created,
        revokeObjectURL: vi.fn(),
      });
      const { view, storage, alert } = await changedHost(withoutUi());
      const before = loadDraft(storage);
      const apply = () =>
        fireEvent.click(
          alert.getByRole("button", {
            name: "Apply my changes to the new version",
          }),
        );
      apply();
      const left = within(await view.findByRole("list", { name: "Left out" }));
      expect(
        left.getByText("There is no host.children.ui in this host."),
      ).toBeTruthy();
      expect(view.getByText("1 of your 2 changes carry over.")).toBeTruthy();
      expect(loadDraft(storage)).toEqual(before);

      fireEvent.click(
        view.getByRole("button", { name: "Download my old version" }),
      );
      expect(created).toHaveBeenCalledOnce();
      expect(loadDraft(storage)).toEqual(before);

      fireEvent.click(view.getByRole("button", { name: "Cancel" }));
      expect(view.queryByRole("list", { name: "Left out" })).toBeNull();
      expect(loadDraft(storage)).toEqual(before);
      expect(loadDraft(storage)?.setters).toContainEqual({
        path: "host.children.ui.runner.dev",
        value: true,
      });

      apply();
      await view.findByRole("list", { name: "Left out" });
      fireEvent.click(view.getByRole("button", { name: "Confirm" }));
      expect(loadDraft(storage)?.setters).toEqual([
        { path: "host.name", value: "renamed" },
      ]);
    });

    it("keeps my version by downloading it, and discards only when asked", async () => {
      const created = vi.fn(() => "blob:draft");
      Object.assign(URL, {
        createObjectURL: created,
        revokeObjectURL: vi.fn(),
      });
      const { view, storage, alert } = await changedHost(withoutUi());
      const before = loadDraft(storage);
      fireEvent.click(alert.getByRole("button", { name: "Keep my version" }));
      expect(created).toHaveBeenCalledOnce();
      expect(alert.getByRole("status").textContent).toBe(
        "Downloaded stack.host-export.json.",
      );
      expect(loadDraft(storage)).toEqual(before);

      fireEvent.click(
        alert.getByRole("button", { name: "Discard my changes" }),
      );
      await waitFor(() =>
        expect(
          view.getByText("The new version is loaded without your changes."),
        ).toBeTruthy(),
      );
      expect(loadDraft(storage)?.setters).toEqual([]);
    });
  });
});
