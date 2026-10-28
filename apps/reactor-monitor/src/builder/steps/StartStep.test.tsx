// @vitest-environment happy-dom
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { baseDigest } from "../../controller/api.js";
import { HOST_EXPORTS } from "../../lib/__fixtures__/host-export/index.js";
import { hostExport, stack } from "../../host-rules/__fixtures__/hosts.js";
import { fakeBuilderClient, PROJECT } from "../__fixtures__/fakes.js";
import { NO_CONTROLLER } from "../copy.js";
import { StartStep } from "./StartStep.js";

describe("StartStep", () => {
  it("offers only a project host or an import", () => {
    const view = render(<StartStep onDiscard={vi.fn()} onDraft={vi.fn()} />);
    const sources = view
      .getAllByRole("button", { pressed: undefined })
      .filter((button) => button.className === "hb-src");
    expect(sources.map((button) => button.textContent)).toEqual([
      expect.stringContaining("From a project host"),
      expect.stringContaining("Import an export"),
    ]);
    expect(view.queryByText(/blank/i)).toBeNull();
  });

  it("needs the controller for a project host", () => {
    const view = render(<StartStep onDiscard={vi.fn()} onDraft={vi.fn()} />);
    expect(
      view.getByRole("button", { name: /From a project host/ }),
    ).toHaveProperty("disabled", true);
    expect(view.getByText(NO_CONTROLLER)).toBeTruthy();
  });

  it("loads a project host with the controller's digest", async () => {
    const onDraft = vi.fn();
    const { client } = fakeBuilderClient();
    const view = render(
      <StartStep client={client} onDiscard={vi.fn()} onDraft={onDraft} />,
    );
    await waitFor(() =>
      expect(view.getByRole("option", { name: "stack" })).toBeTruthy(),
    );
    fireEvent.click(view.getByRole("button", { name: "Load host" }));
    await waitFor(() => expect(onDraft).toHaveBeenCalledOnce());
    expect(onDraft.mock.calls[0][0]).toMatchObject({
      base: {
        kind: "project",
        project: PROJECT,
        host: "stack",
        export: stack(),
      },
      baseDigest: await baseDigest(stack()),
      step: "basics",
    });
  });

  it("imports a pasted export and hashes it itself", async () => {
    const onDraft = vi.fn();
    const view = render(<StartStep onDiscard={vi.fn()} onDraft={onDraft} />);
    const paste = view.getByRole("textbox", { name: "Or paste it" });
    fireEvent.change(paste, { target: { value: "{not json" } });
    fireEvent.click(view.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(view.getByText(/Not JSON/)).toBeTruthy());
    expect(onDraft).not.toHaveBeenCalled();

    fireEvent.change(paste, { target: { value: HOST_EXPORTS.vetra } });
    fireEvent.click(view.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(onDraft).toHaveBeenCalledOnce());
    expect(onDraft.mock.calls[0][0]).toMatchObject({
      base: { kind: "import", export: hostExport("vetra") },
      baseDigest: await baseDigest(hostExport("vetra")),
    });
  });
});
