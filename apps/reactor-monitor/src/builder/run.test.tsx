// @vitest-environment happy-dom
import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import type { HostExport } from "@powerhousedao/host-core/schema";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { baseDigest, type Instance } from "../controller/api.js";
import { ControllerRequestError } from "../controller/client.js";
import { ownerOf } from "../controller/managed.js";
import { BARE, hostExport, stack } from "../host-rules/__fixtures__/hosts.js";
import {
  fakeBuilderClient,
  memoryStorage,
  PROJECT,
} from "./__fixtures__/fakes.js";
import { NO_ADDRESS_YET, START_BLOCKERS } from "./copy.js";
import {
  newDraft,
  requestOf,
  saveDraft,
  withStep,
  type DraftBase,
} from "./draft.js";
import { builderEngine } from "./engine.js";
import { HostBuilder } from "./HostBuilder.js";
import { browserDescriptors, monitoringSetOf, useBuilderRun } from "./run.js";

const ID = "11111111-0000-4000-8000-000000000000";

function instance(status: Instance["status"]): Instance {
  return {
    id: ID,
    project: "/tmp/copy",
    host: "stack",
    status,
    startedAt: "2026-10-28T00:00:00.000Z",
    source: { project: PROJECT, host: "stack" },
    ...(status === "running"
      ? {
          members: {
            sb: {
              host: "switchboard",
              outputs: {
                origin: "http://127.0.0.1:5101",
                graphql: "http://127.0.0.1:5101/graphql",
                drives: {},
              },
            },
            ui: { host: "connect" },
          },
        }
      : {}),
  };
}

const notFound = () =>
  new ControllerRequestError("not_found", "No instance.", 404);

async function storageWith(base: DraftBase) {
  const storage = memoryStorage();
  const draft = withStep(newDraft(base, await baseDigest(base.export)), "use");
  saveDraft(storage, draft);
  return { storage, draft };
}

const projectBase = (envelope: HostExport): DraftBase => ({
  kind: "project",
  project: PROJECT,
  host: envelope.name,
  export: envelope,
});

type Wiring = ReturnType<typeof setup>;

/** The builder over `useBuilderRun`, with a managed hook that only records. */
function Wired({
  wiring,
  onSaveSet,
  storage,
}: {
  wiring: Wiring;
  onSaveSet?: (request: unknown) => string;
  storage: ReturnType<typeof memoryStorage>;
}) {
  const [owned, setOwned] = useState(new Map<string, string[]>());
  const run = useBuilderRun({
    client: wiring.client,
    managed: { ...wiring.managed, owned },
    onAddDescriptors: (added) => {
      wiring.added.push(...added);
      setOwned((previous) => {
        const next = new Map(previous);
        for (const descriptor of added) {
          const owner = ownerOf(descriptor) ?? "";
          next.set(owner, [...(next.get(owner) ?? []), descriptor.name]);
        }
        return next;
      });
    },
    pollMs: 1,
    watchMs: 5,
  });
  return (
    <HostBuilder
      client={wiring.client}
      onSaveSet={onSaveSet}
      onStart={run.start}
      onStop={run.stop}
      run={run.run}
      storage={storage}
    />
  );
}

function setup(
  overrides: {
    startDraft?: () => Promise<Instance>;
    get?: () => Promise<Instance>;
    list?: () => Promise<Instance[]>;
  } = {},
) {
  const startDraft = vi.fn(
    overrides.startDraft ?? (() => Promise.resolve(instance("starting"))),
  );
  const get = vi.fn(
    overrides.get ??
      vi
        .fn<() => Promise<Instance>>()
        .mockResolvedValueOnce(instance("starting"))
        .mockResolvedValue(instance("running")),
  );
  const list = vi.fn(overrides.list ?? (() => Promise.resolve([])));
  const client = { ...fakeBuilderClient({ startDraft }).client, get, list };
  const managed = {
    attach: vi.fn(),
    stopInstance: vi.fn(() => Promise.resolve()),
    dropInstance: vi.fn(),
  };
  const added: ReactorDescriptor[] = [];
  return { client, startDraft, get, list, managed, added };
}

const startButton = (view: ReturnType<typeof render>) =>
  view.getByRole("button", { name: "Start" });

const runText = (view: ReturnType<typeof render>) =>
  view.queryByLabelText("Running copy")?.textContent ?? "";

async function started(view: ReturnType<typeof render>) {
  await waitFor(() =>
    expect(startButton(view)).toHaveProperty("disabled", false),
  );
  fireEvent.click(startButton(view));
  await waitFor(() => expect(runText(view)).toContain("Running a copy"));
}

describe("browserDescriptors", () => {
  it("takes Connect's reactor and leaves the switchboard's own store", () => {
    const envelope = stack();
    const engine = builderEngine(
      newDraft(projectBase(envelope), "0".repeat(64)),
      BARE,
    );
    const names = browserDescriptors(envelope, engine.members).map(
      (descriptor) => descriptor.name,
    );
    expect(names).toEqual(["ui.main"]);
  });
});

describe("monitoringSetOf", () => {
  it("leaves out a switchboard whose address isn't known yet", () => {
    const envelope = hostExport("switchboard");
    const host = envelope.host as { runner: Record<string, unknown> };
    delete host.runner.port;
    delete (host as { reactor?: unknown }).reactor;
    const { request, left } = monitoringSetOf(envelope, "mine");
    expect(request.descriptors).toEqual([]);
    expect(left).toEqual([
      { name: `${envelope.name}.main`, reason: NO_ADDRESS_YET },
    ]);
  });

  it("names the real reason a declared remote has no address", () => {
    const { left } = monitoringSetOf(hostExport("assistant"), "mine");
    expect(left).toEqual([
      {
        name: "assistant.switchboard",
        reason: expect.stringMatching(/names host "switchboard"/) as unknown,
      },
    ]);
  });
});

describe("Use it, wired", () => {
  it("starts the draft, provisions its browser reactors as the copy's, and attaches it once it runs", async () => {
    const { storage, draft } = await storageWith(projectBase(stack()));
    const wiring = setup();
    const view = render(<Wired storage={storage} wiring={wiring} />);
    await started(view);

    expect(wiring.startDraft).toHaveBeenCalledWith(requestOf(draft));
    expect(wiring.added.map((d) => [d.name, d.kind, ownerOf(d)])).toEqual([
      ["ui.main", "worker", ID],
    ]);
    expect(wiring.managed.attach).toHaveBeenCalledWith(instance("running"));
    const running = within(view.getByLabelText("Running copy"));
    expect(running.getByText("http://127.0.0.1:5101/graphql")).toBeTruthy();
    expect(running.getByText("ui.main")).toBeTruthy();
    expect(startButton(view)).toHaveProperty("disabled", true);
  });

  it("stops the copy through the managed hook", async () => {
    const { storage } = await storageWith(projectBase(stack()));
    const wiring = setup();
    const view = render(<Wired storage={storage} wiring={wiring} />);
    await started(view);

    fireEvent.click(view.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(runText(view)).toBe(""));
    expect(wiring.managed.stopInstance).toHaveBeenCalledWith(ID);
    await waitFor(() =>
      expect(startButton(view)).toHaveProperty("disabled", false),
    );
  });

  it("keeps the copy when stopping fails, and says why", async () => {
    const { storage } = await storageWith(projectBase(stack()));
    const wiring = setup();
    wiring.managed.stopInstance.mockRejectedValueOnce(new Error("no answer"));
    const view = render(<Wired storage={storage} wiring={wiring} />);
    await started(view);

    fireEvent.click(view.getByRole("button", { name: "Stop" }));
    await waitFor(() =>
      expect(view.getByText("Couldn't stop it: no answer")).toBeTruthy(),
    );
    expect(runText(view)).toContain("Running a copy");
  });

  it("keeps following a starting copy when one status check fails, and can stop it", async () => {
    const { storage } = await storageWith(projectBase(stack()));
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const get = vi
      .fn<() => Promise<Instance>>()
      .mockRejectedValueOnce(new Error("Controller unreachable: reset."))
      .mockImplementation(async () => {
        await held;
        return instance("running");
      });
    const wiring = setup({ get });
    const view = render(<Wired storage={storage} wiring={wiring} />);
    await waitFor(() =>
      expect(startButton(view)).toHaveProperty("disabled", false),
    );
    fireEvent.click(startButton(view));
    await waitFor(() =>
      expect(runText(view)).toContain("Controller unreachable: reset."),
    );
    expect(runText(view)).toContain("Starting a copy");
    expect(view.queryByText(/Couldn't start/)).toBe(null);
    expect(view.getByRole("button", { name: "Stop" })).toHaveProperty(
      "disabled",
      false,
    );

    release();
    await waitFor(() => expect(runText(view)).toContain("Running a copy"));
    expect(runText(view)).not.toContain("unreachable");
    expect(wiring.managed.attach).toHaveBeenCalledOnce();
  });

  it("stops a copy that is still starting", async () => {
    const { storage } = await storageWith(projectBase(stack()));
    const wiring = setup({ get: () => Promise.resolve(instance("starting")) });
    const view = render(<Wired storage={storage} wiring={wiring} />);
    await waitFor(() =>
      expect(startButton(view)).toHaveProperty("disabled", false),
    );
    fireEvent.click(startButton(view));
    const stop = await waitFor(() => {
      const button = view.getByRole("button", { name: "Stop" });
      expect(button).toHaveProperty("disabled", false);
      return button;
    });
    fireEvent.click(stop);
    await waitFor(() => expect(runText(view)).toBe(""));
    expect(wiring.managed.stopInstance).toHaveBeenCalledWith(ID);
    expect(wiring.managed.attach).not.toHaveBeenCalled();
    expect(view.queryByText(/Couldn't start/)).toBe(null);
  });

  it("lets go of a copy the controller no longer has", async () => {
    const { storage } = await storageWith(projectBase(stack()));
    const get = vi
      .fn<() => Promise<Instance>>()
      .mockResolvedValueOnce(instance("running"))
      .mockRejectedValue(notFound());
    const wiring = setup({ get });
    const view = render(<Wired storage={storage} wiring={wiring} />);
    await waitFor(() =>
      expect(startButton(view)).toHaveProperty("disabled", false),
    );
    fireEvent.click(startButton(view));
    await waitFor(() => expect(wiring.managed.attach).toHaveBeenCalled());
    await waitFor(() => expect(runText(view)).toBe(""));
    expect(wiring.managed.dropInstance).toHaveBeenCalledWith(ID);
  });

  it("says why a copy that failed to start isn't running, and drops its browser reactors", async () => {
    const { storage } = await storageWith(projectBase(stack()));
    const wiring = setup({
      get: () =>
        Promise.resolve({
          ...instance("failed"),
          error: { message: "port taken", phase: "ready", tail: "" },
        }),
    });
    const view = render(<Wired storage={storage} wiring={wiring} />);
    fireEvent.click(await waitFor(() => startButton(view)));
    await waitFor(() =>
      expect(view.getByText("Couldn't start: port taken")).toBeTruthy(),
    );
    expect(runText(view)).toBe("");
    expect(wiring.managed.attach).not.toHaveBeenCalled();
    expect(wiring.managed.dropInstance).toHaveBeenCalledWith(ID);
  });

  it("picks up a running copy after a reload without provisioning again", async () => {
    const { storage } = await storageWith(projectBase(stack()));
    const wiring = setup({
      list: () => Promise.resolve([instance("running")]),
      get: () => Promise.resolve(instance("running")),
    });
    const view = render(<Wired storage={storage} wiring={wiring} />);
    await waitFor(() => expect(runText(view)).toContain("Running a copy"));
    expect(startButton(view)).toHaveProperty("disabled", true);
    expect(wiring.added).toEqual([]);
    expect(wiring.startDraft).not.toHaveBeenCalled();

    fireEvent.click(view.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(runText(view)).toBe(""));
    expect(wiring.managed.stopInstance).toHaveBeenCalledWith(ID);
  });

  it("picks up a copy still starting after a reload, and attaches it once it runs", async () => {
    const { storage } = await storageWith(projectBase(stack()));
    const wiring = setup({
      list: () => Promise.resolve([instance("starting")]),
    });
    const view = render(<Wired storage={storage} wiring={wiring} />);
    await waitFor(() => expect(runText(view)).toContain("Running a copy"));
    expect(wiring.managed.attach).toHaveBeenCalledWith(instance("running"));
    expect(wiring.added).toEqual([]);
  });

  it("offers to rebase when the project host changed since the draft began", async () => {
    const { storage } = await storageWith(projectBase(stack()));
    const wiring = setup({
      startDraft: () =>
        Promise.reject(
          new ControllerRequestError("base_changed", "The host changed.", 409),
        ),
    });
    const view = render(<Wired storage={storage} wiring={wiring} />);
    await waitFor(() =>
      expect(startButton(view)).toHaveProperty("disabled", false),
    );
    fireEvent.click(startButton(view));
    await waitFor(() =>
      expect(
        view.getByRole("button", {
          name: "Apply my changes to the new version",
        }),
      ).toBeTruthy(),
    );
    expect(runText(view)).toBe("");
    expect(wiring.added).toEqual([]);
  });

  it("won't start an import from a project the controller doesn't serve", async () => {
    const envelope = {
      ...stack(),
      project: { name: "elsewhere", root: "/elsewhere" },
    };
    const { storage } = await storageWith({ kind: "import", export: envelope });
    const wiring = setup();
    const view = render(<Wired storage={storage} wiring={wiring} />);
    await waitFor(() =>
      expect(view.getByText(START_BLOCKERS.notServed)).toBeTruthy(),
    );
    expect(startButton(view)).toHaveProperty("disabled", true);
    expect(wiring.startDraft).not.toHaveBeenCalled();
  });

  it("saves the host as a monitoring set", async () => {
    const envelope = stack();
    const { storage } = await storageWith(projectBase(envelope));
    const onSaveSet = vi.fn(() => "my-stack-2");
    const view = render(
      <Wired onSaveSet={onSaveSet} storage={storage} wiring={setup()} />,
    );
    const name = await waitFor(() =>
      view.getByLabelText("Save as a monitoring set"),
    );
    fireEvent.change(name, { target: { value: "my-stack" } });
    fireEvent.click(view.getByRole("button", { name: "Save set" }));

    const { request } = monitoringSetOf(envelope, "my-stack");
    expect(onSaveSet).toHaveBeenCalledWith(request);
    expect(request.source).toEqual({
      project: envelope.project,
      host: "stack",
    });
    expect(request.descriptors.length).toBeGreaterThan(0);
    expect(
      view.getByText('Saved as the monitoring set "my-stack-2".'),
    ).toBeTruthy();
  });
});
