// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { baseDigest } from "../controller/api.js";
import { FULL, stack } from "../host-rules/__fixtures__/hosts.js";
import { applySetters } from "../host-rules/setters.js";
import { fakeBuilderClient, PROJECT } from "./__fixtures__/fakes.js";
import { BaseChanged } from "./BaseChanged.js";
import { addEdit, newDraft, type BuilderDraft } from "./draft.js";
import { builderEngine } from "./engine.js";

const NEW_PORT = { path: "members.switchboard.runner.port", value: 4555 };
const LATER = { path: "members.switchboard.runner.dev", value: true };

async function setup() {
  const old = stack();
  const fresh = applySetters(old, [NEW_PORT]).envelope;
  const freshDigest = await baseDigest(fresh);
  const { client } = fakeBuilderClient({
    exportHost: () =>
      Promise.resolve({ export: fresh, baseDigest: freshDigest }),
  });
  const draft = addEdit(
    newDraft(
      { kind: "project", project: PROJECT, host: "stack", export: old },
      await baseDigest(old),
    ),
    [{ path: "host.name", value: "renamed" }],
  );
  const onDraft = vi.fn();
  const onLock = vi.fn();
  const panel = (current: BuilderDraft) => (
    <BaseChanged
      client={client}
      draft={current}
      engine={builderEngine(current, FULL)}
      onClose={vi.fn()}
      onDraft={onDraft}
      onLock={onLock}
    />
  );
  const view = render(panel(draft));
  fireEvent.click(
    view.getByRole("button", { name: "Apply my changes to the new version" }),
  );
  await view.findByRole("dialog");
  return { view, panel, draft, onDraft, onLock };
}

describe("BaseChanged", () => {
  it("opens the preview as a modal that locks the builder", async () => {
    const { view, onLock, onDraft } = await setup();
    expect(view.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    expect(onLock).toHaveBeenLastCalledWith(true);
    fireEvent.click(view.getByRole("button", { name: "Cancel" }));
    expect(onLock).toHaveBeenLastCalledWith(false);
    expect(onDraft).not.toHaveBeenCalled();
  });

  it("never saves a preview older than the draft, and keeps the later edit", async () => {
    const { view, panel, draft, onDraft, onLock } = await setup();
    const edited = addEdit(draft, [LATER]);
    view.rerender(panel(edited));

    fireEvent.click(view.getByRole("button", { name: "Confirm" }));
    expect(onDraft).not.toHaveBeenCalled();
    expect(
      view.getByText(/Your draft changed while this was open/),
    ).toBeTruthy();
    expect(view.getByText("All 2 of your changes carry over.")).toBeTruthy();
    expect(view.getByText(LATER.path)).toBeTruthy();
    expect(onLock).toHaveBeenLastCalledWith(true);

    fireEvent.click(view.getByRole("button", { name: "Confirm" }));
    expect(onDraft).toHaveBeenCalledOnce();
    const saved = onDraft.mock.calls[0][0] as BuilderDraft;
    expect(saved.setters).toEqual([...edited.setters]);
    expect(saved.edits).toEqual([1, 1]);
    expect(saved.base.export.members.switchboard).toMatchObject({
      runner: { port: 4555 },
    });
    expect(onLock).toHaveBeenLastCalledWith(false);
  });
});
