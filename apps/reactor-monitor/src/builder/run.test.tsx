// @vitest-environment happy-dom
import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import type { HostExport } from "@powerhousedao/host-core/schema";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { baseDigest, type Instance } from "../controller/api.js";
import { ControllerRequestError } from "../controller/client.js";
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
import {
  browserDescriptors,
  monitoringSetOf,
  useBuilderRun,
  type BuilderRunOptions,
} from "./run.js";

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

function Wired({
  options,
  onSaveSet,
  storage,
}: {
  options: BuilderRunOptions & {
    client: ReturnType<typeof fakeBuilderClient>["client"] & {
      get: (id: string) => Promise<Instance>;
    };
  };
  onSaveSet?: (request: unknown) => string;
  storage: ReturnType<typeof memoryStorage>;
}) {
  const run = useBuilderRun(options);
  return (
    <HostBuilder
      client={options.client}
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
    attachedIds?: ReadonlySet<string>;
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
  const client = { ...fakeBuilderClient({ startDraft }).client, get };
  const managed = {
    attach: vi.fn(),
    stopInstance: vi.fn(() => Promise.resolve()),
    attachedIds: overrides.attachedIds ?? new Set<string>(),
  };
  const onAddDescriptors = vi.fn((added: ReactorDescriptor[]) =>
    added.map((descriptor) => descriptor.name),
  );
  const onKill = vi.fn();
  const options = {
    client,
    managed,
    onAddDescriptors,
    onKill,
    pollMs: 1,
  };
  return { options, startDraft, get, managed, onAddDescriptors, onKill };
}

const startButton = (view: ReturnType<typeof render>) =>
  view.getByRole("button", { name: "Start" });

async function started(view: ReturnType<typeof render>) {
  await waitFor(() =>
    expect(startButton(view)).toHaveProperty("disabled", false),
  );
  fireEvent.click(startButton(view));
  await waitFor(() =>
    expect(view.getByLabelText("Running copy").textContent).toContain(
      "Running a copy",
    ),
  );
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
});

describe("Use it, wired", () => {
  it("starts the draft, waits until it runs, attaches it and provisions its browser reactors", async () => {
    const { storage, draft } = await storageWith(projectBase(stack()));
    const wiring = setup();
    const view = render(<Wired options={wiring.options} storage={storage} />);
    await started(view);

    expect(wiring.startDraft).toHaveBeenCalledWith(requestOf(draft));
    expect(wiring.get).toHaveBeenCalledTimes(2);
    expect(wiring.managed.attach).toHaveBeenCalledWith(instance("running"));
    expect(
      wiring.onAddDescriptors.mock.calls[0][0].map((d) => [d.name, d.kind]),
    ).toEqual([["ui.main", "worker"]]);
    const running = within(view.getByLabelText("Running copy"));
    expect(running.getByText("http://127.0.0.1:5101/graphql")).toBeTruthy();
    expect(running.getByText("ui.main")).toBeTruthy();
    expect(startButton(view)).toHaveProperty("disabled", true);
  });

  it("stops the copy and removes its browser reactors", async () => {
    const { storage } = await storageWith(projectBase(stack()));
    const wiring = setup();
    const view = render(<Wired options={wiring.options} storage={storage} />);
    await started(view);

    fireEvent.click(view.getByRole("button", { name: "Stop" }));
    await waitFor(() =>
      expect(view.queryByLabelText("Running copy")).toBe(null),
    );
    expect(wiring.managed.stopInstance).toHaveBeenCalledWith(ID);
    expect(wiring.onKill).toHaveBeenCalledWith("ui.main");
    await waitFor(() =>
      expect(startButton(view)).toHaveProperty("disabled", false),
    );
  });

  it("keeps the copy when stopping fails, and says why", async () => {
    const { storage } = await storageWith(projectBase(stack()));
    const wiring = setup();
    wiring.managed.stopInstance.mockRejectedValueOnce(new Error("no answer"));
    const view = render(<Wired options={wiring.options} storage={storage} />);
    await started(view);

    fireEvent.click(view.getByRole("button", { name: "Stop" }));
    await waitFor(() =>
      expect(view.getByText("Couldn't stop it: no answer")).toBeTruthy(),
    );
    expect(view.getByLabelText("Running copy")).toBeTruthy();
    expect(wiring.onKill).not.toHaveBeenCalled();
  });

  it("forgets a copy stopped elsewhere", async () => {
    const { storage } = await storageWith(projectBase(stack()));
    const wiring = setup({ attachedIds: new Set([ID]) });
    const view = render(<Wired options={wiring.options} storage={storage} />);
    await started(view);

    const managed = { ...wiring.managed, attachedIds: new Set<string>() };
    view.rerender(
      <Wired options={{ ...wiring.options, managed }} storage={storage} />,
    );
    await waitFor(() =>
      expect(view.queryByLabelText("Running copy")).toBe(null),
    );
  });

  it("says why a copy that failed to start isn't running", async () => {
    const { storage } = await storageWith(projectBase(stack()));
    const wiring = setup({
      get: () =>
        Promise.resolve({
          ...instance("failed"),
          error: { message: "port taken", phase: "ready", tail: "" },
        }),
    });
    const view = render(<Wired options={wiring.options} storage={storage} />);
    fireEvent.click(await waitFor(() => startButton(view)));
    await waitFor(() =>
      expect(view.getByText("Couldn't start: port taken")).toBeTruthy(),
    );
    expect(view.queryByLabelText("Running copy")).toBe(null);
    expect(wiring.managed.attach).not.toHaveBeenCalled();
  });

  it("offers to rebase when the project host changed since the draft began", async () => {
    const { storage } = await storageWith(projectBase(stack()));
    const wiring = setup({
      startDraft: () =>
        Promise.reject(
          new ControllerRequestError("base_changed", "The host changed.", 409),
        ),
    });
    const view = render(<Wired options={wiring.options} storage={storage} />);
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
    expect(view.queryByLabelText("Running copy")).toBe(null);
  });

  it("won't start an import from a project the controller doesn't serve", async () => {
    const envelope = {
      ...stack(),
      project: { name: "elsewhere", root: "/elsewhere" },
    };
    const { storage } = await storageWith({ kind: "import", export: envelope });
    const wiring = setup();
    const view = render(<Wired options={wiring.options} storage={storage} />);
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
      <Wired
        onSaveSet={onSaveSet}
        options={setup().options}
        storage={storage}
      />,
    );
    const name = await waitFor(() =>
      view.getByLabelText("Save as a monitoring set"),
    );
    fireEvent.change(name, { target: { value: "my-stack" } });
    fireEvent.click(view.getByRole("button", { name: "Save set" }));

    expect(onSaveSet).toHaveBeenCalledWith(
      monitoringSetOf(envelope, "my-stack").request,
    );
    const request = monitoringSetOf(envelope, "my-stack").request;
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
