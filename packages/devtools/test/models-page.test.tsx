// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INVOICE,
  invoiceDetail,
  pollNow,
  projectServer,
  renderDevtools,
  serveProject,
  snapshot,
  type ProjectServer,
} from "./project.fixture.js";
import { clearStorage, savedView } from "./storage.fixture.js";

let server: ProjectServer;

beforeEach(() => {
  clearStorage();
  server = projectServer();
  serveProject(server);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

const page = () => screen.getByTestId("ph-models-page");
const sections = () => screen.getByTestId("ph-model-sections");
const text = (testId: string) => screen.getByTestId(testId).textContent;
/** The operations the list names, in order. */
const operations = () =>
  screen
    .getAllByTestId("ph-operation-link")
    .map((row) => row.dataset.operation);
/** The operations shown in full. */
const shown = () =>
  screen.getAllByTestId("ph-operation").map((row) => row.dataset.operation);
const operation = (name: string) =>
  screen
    .getAllByTestId("ph-operation")
    .find((candidate) => candidate.dataset.operation === name)!;
const link = (name: string) =>
  screen
    .getAllByTestId("ph-operation-link")
    .find((candidate) => candidate.dataset.operation === name)!;
const part = (name: string, testId: string) =>
  within(operation(name)).getByTestId(testId).textContent;
const stateTab = (scope: string) =>
  screen
    .getAllByTestId("ph-state-tab")
    .find((candidate) => candidate.dataset.scope === scope)!;
const click = (element: Element) => {
  act(() => {
    fireEvent.click(element);
  });
};

async function open(focus?: string) {
  renderDevtools("models", focus);
  await waitFor(() =>
    expect(screen.queryByTestId("ph-model-sections")).not.toBeNull(),
  );
}

describe("Build › Document models", () => {
  it("shows the name and version in the title row and the rest beside it", async () => {
    await open();
    expect(text("ph-model-name")).toBe("Invoice");
    expect(text("ph-model-version")).toBe("v1");
    expect(text("ph-model-type")).toBe("acme/invoice");
    expect(text("ph-model-extension")).toBe(".inv");
    expect(text("ph-checks-summary")).toBe("3 checks pass");
    expect(text("ph-model-about")).toBe(
      "An invoice with line items and a payment status.",
    );
    expect(text("ph-model-author")).toBe("Acme");
    expect(text("ph-model-folder")).toBe("document-models/invoice/");
    const website = screen.getByTestId("ph-model-website").querySelector("a");
    expect(website?.getAttribute("href")).toBe("https://acme.dev");
    expect(website?.textContent).toBe("acme.dev");

    const toggle = screen.getByTestId("ph-model-meta-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toBe("Metadata");
    click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("lays out the state, then the modules with their operations listed", async () => {
    await open();
    expect(
      [...sections().querySelectorAll("section")].map(
        (section) => section.querySelector("h3")?.textContent,
      ),
    ).toEqual(["State", "Modules"]);
    expect(screen.getByTestId("ph-model-modules").dataset.layout).toBe("list");
    expect(text("ph-model-modules")).not.toContain("operations in");
    const modules = screen.getAllByTestId("ph-model-module");
    expect(modules.map((module) => module.dataset.module)).toEqual([
      "items",
      "details",
    ]);
    expect(
      modules.map((module) =>
        within(module)
          .getAllByTestId("ph-operation-link")
          .map((row) => row.dataset.operation),
      ),
    ).toEqual([
      ["ADD_LINE_ITEM", "REMOVE_LINE_ITEM"],
      ["SET_CUSTOMER", "SET_STATUS"],
    ]);
  });

  it("shows the global state in its tab, and says so when the model has no local state", async () => {
    await open();
    expect(screen.getByTestId("ph-model-state").dataset.scope).toBe("global");
    expect(stateTab("global").getAttribute("aria-selected")).toBe("true");
    expect(text("ph-state-schema")).toContain("type InvoiceState {");
    expect(text("ph-state-initial")).toContain('"status": "DRAFT"');
    expect(screen.queryByTestId("ph-state-none")).toBeNull();

    click(stateTab("local"));
    expect(stateTab("local").getAttribute("aria-selected")).toBe("true");
    expect(text("ph-state-none")).toContain("No local state");
    expect(screen.queryByTestId("ph-state-schema")).toBeNull();
  });

  it("switches to the local state, and saves the tab in the view", async () => {
    const detail = invoiceDetail();
    detail.specifications[0].state.local = {
      schema: "type InvoiceLocalState {\n  draftNote: String\n}",
      initialValue: '{\n  "draftNote": null\n}',
    };
    server.details["acme/invoice"] = detail;
    await open();
    click(stateTab("local"));
    expect(savedView().focus).toBe("model:acme/invoice#state:local");
    expect(stateTab("local").getAttribute("aria-selected")).toBe("true");
    expect(text("ph-state-schema")).toContain("type InvoiceLocalState {");
    expect(text("ph-state-initial")).toContain('"draftNote": null');

    click(stateTab("global"));
    expect(text("ph-state-schema")).toContain("type InvoiceState {");
  });

  it("indents JSON written on one line, and shows other text as written", async () => {
    const detail = invoiceDetail();
    const [specification] = detail.specifications;
    specification.state.global.initialValue =
      '{"number":null,"status":"DRAFT","items":[],"totals":{}}';
    specification.modules[0].operations[1].examples = [
      '{"id":"item-1"}',
      "{ not json",
    ];
    server.details["acme/invoice"] = detail;
    await open("model:acme/invoice#op:REMOVE_LINE_ITEM");

    expect(text("ph-state-initial")).toBe(
      '{\n  "number": null,\n  "status": "DRAFT",\n  "items": [],\n  "totals": {}\n}',
    );
    const examples = [
      ...within(operation("REMOVE_LINE_ITEM"))
        .getByTestId("ph-operation-examples")
        .querySelectorAll("pre"),
    ].map((pre) => pre.textContent);
    expect(examples).toEqual(['{\n  "id": "item-1"\n}', "{ not json"]);
  });

  it("puts a module's description behind an icon beside its name", async () => {
    const detail = invoiceDetail();
    detail.specifications[0].modules[0].description = "The invoice's lines.";
    server.details["acme/invoice"] = detail;
    await open();
    const info = screen.getAllByTestId("ph-module-info");
    expect(info.map((icon) => icon.getAttribute("aria-label"))).toEqual([
      "items: The invoice's lines.",
    ]);
    expect(text("ph-model-modules")).not.toContain("The invoice's lines.");
  });

  it("shows the first operation in full, and another once chosen", async () => {
    await open();
    expect(shown()).toEqual(["ADD_LINE_ITEM"]);
    expect(link("ADD_LINE_ITEM").getAttribute("aria-selected")).toBe("true");
    expect(part("ADD_LINE_ITEM", "ph-operation-scope")).toBe("global");
    expect(part("ADD_LINE_ITEM", "ph-operation-input")).toContain(
      "input AddLineItemInput {",
    );
    expect(operation("ADD_LINE_ITEM").textContent).toContain(
      "Adds a line item to the invoice.",
    );
    expect(operation("ADD_LINE_ITEM").textContent).not.toContain("Reducer");
    expect(
      within(operation("ADD_LINE_ITEM")).queryByTestId("ph-open-file"),
    ).toBeNull();
    expect(part("ADD_LINE_ITEM", "ph-operation-errors")).toBe("None declared.");
    expect(part("ADD_LINE_ITEM", "ph-operation-examples")).toBe("None.");

    click(link("SET_CUSTOMER"));

    expect(savedView().focus).toBe("model:acme/invoice#op:SET_CUSTOMER");
    expect(shown()).toEqual(["SET_CUSTOMER"]);
    expect(link("SET_CUSTOMER").getAttribute("aria-selected")).toBe("true");
    expect(link("ADD_LINE_ITEM").getAttribute("aria-selected")).toBe("false");
  });

  it("moves through the operations with the arrow keys", async () => {
    await open();
    act(() => {
      fireEvent.keyDown(link("ADD_LINE_ITEM"), { key: "ArrowDown" });
    });
    expect(shown()).toEqual(["REMOVE_LINE_ITEM"]);
    act(() => {
      fireEvent.keyDown(link("REMOVE_LINE_ITEM"), { key: "ArrowDown" });
    });
    expect(shown()).toEqual(["SET_CUSTOMER"]);
  });

  it("stacks every operation in full under its module when narrow", async () => {
    const real = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(private readonly report: ResizeObserverCallback) {}
      observe(target: Element) {
        this.report(
          [{ target, contentRect: { width: 400 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      await open("model:acme/invoice#op:SET_STATUS");
      expect(screen.getByTestId("ph-model-modules").dataset.layout).toBe(
        "stack",
      );
      expect(screen.queryByTestId("ph-operation-link")).toBeNull();
      const modules = screen.getAllByTestId("ph-model-module");
      expect(
        modules.map((module) =>
          within(module)
            .getAllByTestId("ph-operation")
            .map((row) => row.dataset.operation),
        ),
      ).toEqual([
        ["ADD_LINE_ITEM", "REMOVE_LINE_ITEM"],
        ["SET_CUSTOMER", "SET_STATUS"],
      ]);
      expect(modules[0].textContent).toContain("2 operations");
      expect(part("SET_STATUS", "ph-operation-input")).toBe("Takes no input.");
    } finally {
      globalThis.ResizeObserver = real;
    }
  });

  it("lists an operation's errors and examples", async () => {
    await open("model:acme/invoice#op:REMOVE_LINE_ITEM");
    expect(shown()).toEqual(["REMOVE_LINE_ITEM"]);
    expect(operation("REMOVE_LINE_ITEM").textContent).toContain("Errors · 1");
    expect(operation("REMOVE_LINE_ITEM").textContent).toContain("Examples · 1");
    expect(text("ph-operation-errors")).toBe(
      "LineItemNotFoundLINE_ITEM_NOT_FOUNDNo line item has that id.",
    );
    expect(text("ph-operation-examples")).toContain('"id": "item-1"');
  });

  it("says when an operation takes no input", async () => {
    await open("model:acme/invoice#op:SET_STATUS");
    expect(part("SET_STATUS", "ph-operation-input")).toBe("Takes no input.");
  });

  it("switches to another model of the project", async () => {
    await open("model:acme/invoice#op:SET_STATUS");
    // The whole name opens the menu.
    expect(
      screen
        .getByTestId("ph-model-switcher")
        .contains(screen.getByTestId("ph-model-name")),
    ).toBe(true);
    click(screen.getByTestId("ph-model-name"));
    const options = await screen.findAllByTestId("ph-model-option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Invoiceacme/invoiceLegacy",
      "Customeracme/customerLegacy",
    ]);

    click(options[1]);

    expect(savedView().focus).toBe("model:acme/customer");
    await waitFor(() => expect(text("ph-model-name")).toBe("Customer"));
    await waitFor(() => expect(operations()).toContain("SET_CUSTOMER_NAME"));
  });

  it("finds a model by its name or document type", async () => {
    await open();
    click(screen.getByTestId("ph-model-name"));
    const search = await screen.findByTestId("ph-model-search");
    const shown = () =>
      screen
        .queryAllByTestId("ph-model-option")
        .map((option) => option.dataset.documentType);

    fireEvent.change(search, { target: { value: "cust" } });
    await waitFor(() => expect(shown()).toEqual(["acme/customer"]));

    fireEvent.change(search, { target: { value: "acme/invoice" } });
    await waitFor(() => expect(shown()).toEqual(["acme/invoice"]));

    fireEvent.change(search, { target: { value: "nothing like it" } });
    await waitFor(() => expect(shown()).toEqual([]));
    expect(screen.getByText("No document model matches.")).toBeTruthy();
  });

  it("has no switcher for a project with one model", async () => {
    server.snapshot = snapshot({
      documentModels: { ok: true, items: [INVOICE] },
    });
    await open();
    expect(screen.queryByTestId("ph-model-switcher")).toBeNull();
  });

  it("shows the latest version and switches to an earlier one", async () => {
    const [v1] = invoiceDetail().specifications;
    const model = { ...INVOICE, versions: [1, 2] };
    server.snapshot = snapshot({
      documentModels: { ok: true, items: [model] },
    });
    server.details["acme/invoice"] = invoiceDetail({
      versions: [1, 2],
      specifications: [
        { ...v1, modules: [v1.modules[0]] },
        { ...v1, version: 2 },
      ],
    });
    await open("model:acme/invoice#op:ADD_LINE_ITEM");
    expect(screen.queryByTestId("ph-model-version")).toBeNull();
    expect(text("ph-model-version-switcher")).toBe("v2");
    expect(operations()).toContain("SET_STATUS");

    click(screen.getByTestId("ph-model-version-switcher"));
    const options = await screen.findAllByTestId("ph-model-version-option");
    click(options[0]);

    expect(savedView().focus).toBe("model:acme/invoice@v1#op:ADD_LINE_ITEM");
    await waitFor(() => expect(text("ph-model-version-switcher")).toBe("v1"));
    expect(operations()).not.toContain("SET_STATUS");
    expect(shown()).toEqual(["ADD_LINE_ITEM"]);
  });

  it("restores the model and the open operation from the saved view", async () => {
    await open("model:acme/customer#op:SET_CUSTOMER_NAME");
    expect(text("ph-model-name")).toBe("Customer");
    expect(shown()).toEqual(["SET_CUSTOMER_NAME"]);
  });

  it("opens a model whose document type holds a # or ends like a version", async () => {
    const odd = { ...INVOICE, documentType: "acme/invoice#draft@v2" };
    server.snapshot = snapshot({
      documentModels: { ok: true, items: [INVOICE, odd] },
    });
    server.details[odd.documentType] = invoiceDetail({
      documentType: odd.documentType,
    });
    await open("model:acme/invoice#draft@v2#op:SET_STATUS");
    expect(text("ph-model-type")).toBe("acme/invoice#draft@v2");
    expect(shown()).toEqual(["SET_STATUS"]);

    click(link("ADD_LINE_ITEM"));
    expect(savedView().focus).toBe(
      "model:acme/invoice#draft@v2#op:ADD_LINE_ITEM",
    );
    expect(text("ph-model-type")).toBe("acme/invoice#draft@v2");
  });

  it("keeps a model on screen when reading it again fails", async () => {
    await open();
    server.snapshot = snapshot({ revision: "r2" });
    server.routeFailures = {
      "project/document-models/acme%2Finvoice": {
        code: "internal",
        message: "EMFILE",
      },
    };
    pollNow();
    const note = await screen.findByTestId("ph-model-stale");
    expect(note.title).toBe("EMFILE");
    expect(operations()).toContain("ADD_LINE_ITEM");

    server.routeFailures = undefined;
    pollNow();
    await waitFor(() =>
      expect(screen.queryByTestId("ph-model-stale")).toBeNull(),
    );
  });

  it("summarises checks that did not pass", async () => {
    server.snapshot = snapshot({
      documentModels: {
        ok: true,
        items: [
          {
            ...INVOICE,
            checks: [
              INVOICE.checks[0],
              {
                id: "manifest",
                state: "warn",
                label: "Not listed in powerhouse.manifest.json",
              },
            ],
          },
        ],
      },
    });
    await open();
    const summary = screen.getByTestId("ph-checks-summary");
    expect(summary.textContent).toBe("1 problem");
    expect(summary.dataset.state).toBe("warn");
    expect(summary.title).toBe("Not listed in powerhouse.manifest.json");
  });

  it("shows why a model could not be read in place of its sections", async () => {
    delete server.details["acme/invoice"];
    renderDevtools("models");
    const error = await screen.findByTestId("ph-model-error");
    expect(error.getAttribute("role")).toBe("alert");
    expect(error.textContent).toContain("Could not read Invoice");
    expect(error.textContent).toContain(
      'No DevTools route "project/document-models/acme%2Finvoice".',
    );
    expect(text("ph-model-name")).toBe("Invoice");
  });

  it("says how to create the first model, with a command to copy", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    server.snapshot = snapshot({ documentModels: { ok: true, items: [] } });
    renderDevtools("models");

    const empty = await screen.findByTestId("ph-kind-empty");
    expect(empty.textContent).toContain("No document models in this project");
    expect(empty.textContent).toContain(
      "A document model defines a document type: its state and the operations that change it.",
    );
    expect(within(empty).getByTestId("ph-command").textContent).toContain(
      "ph generate document-model --name <name>",
    );

    click(within(empty).getByTestId("ph-copy"));
    expect(writeText).toHaveBeenCalledWith(
      "ph generate document-model --name <name>",
    );
    await waitFor(() =>
      expect(within(empty).getByTestId("ph-copy").textContent).toBe("Copied"),
    );
  });

  it("shows why the document models could not be read", async () => {
    server.snapshot = snapshot({
      documentModels: {
        ok: false,
        message: "document-models/invoice/invoice.json: Unexpected token }",
      },
    });
    renderDevtools("models");
    const error = await screen.findByTestId("ph-section-error");
    expect(error.getAttribute("role")).toBe("alert");
    expect(error.textContent).toContain("Could not read the document models");
    expect(error.textContent).toContain(
      "document-models/invoice/invoice.json: Unexpected token }",
    );
  });

  it("says a dev server that does not read the project cannot show it", async () => {
    server.snapshot = undefined;
    renderDevtools("models");
    expect(page().textContent).toBe("Reading the project…");
    const unavailable = await screen.findByTestId("ph-project-unavailable");
    expect(unavailable.dataset.code).toBe("not_found");
    expect(unavailable.textContent).toContain(
      "This dev server does not read the project",
    );
  });

  it("offers a reload once the dev server has restarted", async () => {
    await open();
    server.failure = {
      code: "bad_token",
      message: "The token does not match.",
    };
    pollNow();

    const note = await screen.findByTestId("ph-project-stale");
    expect(note.textContent).toBe(
      "The dev server restarted. Showing the last read.Reload the page",
    );
    expect(within(note).getByTestId("ph-reload")).toBeDefined();
    expect(text("ph-model-name")).toBe("Invoice");
  });

  it("keeps the page and notes that it could not refresh", async () => {
    await open();
    server.failure = "network";
    pollNow();

    const note = await screen.findByTestId("ph-project-stale");
    expect(note.textContent).toBe("Could not refresh. Showing the last read.");
    expect(note.title).toBe("Failed to fetch");
    expect(text("ph-model-name")).toBe("Invoice");

    server.failure = undefined;
    pollNow();
    await waitFor(() =>
      expect(screen.queryByTestId("ph-project-stale")).toBeNull(),
    );
  });

  it("follows the code: a new revision shows without a reload", async () => {
    await open("model:acme/invoice#op:ADD_LINE_ITEM");
    const edited = invoiceDetail({ revision: "r2" });
    edited.specifications[0].modules[0].operations[0].description =
      "Appends a line item.";
    server.details["acme/invoice"] = edited;
    server.snapshot = snapshot({ revision: "r2" });
    pollNow();

    await waitFor(() =>
      expect(operation("ADD_LINE_ITEM").textContent).toContain(
        "Appends a line item.",
      ),
    );
  });
});

describe("Build › Document models › schema view", () => {
  const view = (id: "sdl" | "diagram") =>
    within(screen.getByTestId("ph-schema-view")).getByRole("button", {
      name: id === "sdl" ? "Show SDL" : "Show Diagram",
    });

  it("shows the state schema as SDL, with a switch to a diagram", async () => {
    await open();
    expect(view("sdl").getAttribute("aria-pressed")).toBe("true");
    expect(view("diagram").getAttribute("aria-pressed")).toBe("false");
    expect(text("ph-state-schema")).toContain("type InvoiceState {");
  });

  it("draws the schema with the initial state below it, and keeps the choice for every model", async () => {
    await open();
    click(view("diagram"));
    await screen.findByTestId("ph-schema-diagram");
    expect(view("diagram").getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByTestId("ph-state-schema")).toBeNull();
    expect(text("ph-diagram-count")).toBe("3 types · 2 relations");
    expect(text("ph-state-initial")).toContain('"status": "DRAFT"');
    expect(localStorage.getItem("ph-devtools:schema-view")).toBe('"diagram"');

    cleanup();
    await open("model:acme/customer");
    await screen.findByTestId("ph-schema-diagram");
    expect(view("diagram").getAttribute("aria-pressed")).toBe("true");

    click(view("sdl"));
    expect(screen.queryByTestId("ph-schema-diagram")).toBeNull();
    expect(screen.getByTestId("ph-state-schema")).not.toBeNull();
  });

  it("says why a schema that does not parse has no diagram, and goes back to SDL", async () => {
    const detail = invoiceDetail();
    detail.specifications[0].state.global.schema =
      "type InvoiceState {\n  number String\n}";
    server.details["acme/invoice"] = detail;
    await open();
    click(view("diagram"));
    const unavailable = await screen.findByTestId("ph-diagram-unavailable");
    expect(unavailable.textContent).toContain("Diagram unavailable");
    expect(unavailable.textContent).toContain('Syntax Error: Expected ":"');

    click(within(unavailable).getByRole("button", { name: "Show SDL" }));
    expect(view("sdl").getAttribute("aria-pressed")).toBe("true");
    expect(text("ph-state-schema")).toContain("number String");
  });

  it("offers no switch for a state without a schema", async () => {
    const detail = invoiceDetail();
    detail.specifications[0].state.global.schema = "";
    server.details["acme/invoice"] = detail;
    await open();
    expect(screen.queryByTestId("ph-schema-view")).toBeNull();
    expect(text("ph-state-schema")).toBe("No schema.");
  });
});

describe("Build › Document models › a legacy document model", () => {
  const notice = () => screen.getByTestId("ph-legacy-notice");
  const way = (id: string) =>
    screen
      .getAllByTestId("ph-legacy-way")
      .find((candidate) => candidate.dataset.way === id)!;
  const clipboard = () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    return writeText;
  };

  it("is marked beside its name, with the command that converts it", async () => {
    await open();
    expect(text("ph-legacy-tag")).toBe("Legacy document model");
    expect(notice().textContent).toContain(
      "Powerhouse 6.4 is planned to stop loading packages that have one.",
    );
    expect(within(notice()).getByTestId("ph-command").textContent).toContain(
      "ph migrate --document-model invoice",
    );
    expect(text("ph-model-source")).toBe("invoice.json");
  });

  it("copies the command, with --dry-run to preview first", async () => {
    const writeText = clipboard();
    await open();

    click(within(notice()).getByTestId("ph-copy"));
    expect(writeText).toHaveBeenLastCalledWith(
      "ph migrate --document-model invoice",
    );

    click(screen.getByTestId("ph-legacy-dry-run"));
    click(within(notice()).getByTestId("ph-copy"));
    expect(writeText).toHaveBeenLastCalledWith(
      "ph migrate --document-model invoice --dry-run",
    );
  });

  it("copies a prompt that has an agent run the command and check the result", async () => {
    const writeText = clipboard();
    await open();

    click(way("agent"));
    expect(screen.queryByTestId("ph-legacy-dry-run")).toBeNull();
    expect(text("ph-legacy-prompt")).toContain(
      "convert the legacy document model in document-models/invoice/ (document type acme/invoice)",
    );

    click(screen.getByTestId("ph-legacy-copy-prompt"));
    const prompt = writeText.mock.lastCall?.[0];
    expect(prompt).toContain("Run `ph migrate --document-model invoice`.");
    expect(prompt).toContain("`document-models/invoice/compat/v<N>/`");
  });

  it("says nothing about legacy for a model that is not", async () => {
    server.snapshot = snapshot({
      documentModels: {
        ok: true,
        items: [
          {
            ...INVOICE,
            authoring: "current",
            source: "document-models/invoice/index.ts",
          },
        ],
      },
    });
    await open();
    expect(screen.queryByTestId("ph-legacy-tag")).toBeNull();
    expect(screen.queryByTestId("ph-legacy-notice")).toBeNull();
    expect(text("ph-model-source")).toBe("index.ts");
  });
});
